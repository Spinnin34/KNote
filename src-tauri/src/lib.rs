use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};

use keyring::Entry;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::Value;
use tauri::{Manager, State, path::BaseDirectory};
use zeroize::Zeroize;

const VAULT_KEY_SERVICE: &str = "com.karmancos.knote";
const VAULT_KEY_ACCOUNT: &str = "local-vault-v1";

struct VaultState {
    connection: Mutex<Option<Connection>>,
    unavailable_reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredAsset {
    mime_type: String,
    bytes: Vec<u8>,
}

fn desktop_vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("KNote/KNote.knt", BaseDirectory::Document)
        .map_err(|error| format!("No se pudo localizar la carpeta Documentos: {error}"))
}

fn load_or_create_key(database_exists: bool) -> Result<Vec<u8>, String> {
    Entry::store_status()
        .as_ref()
        .map_err(|error| format!("No se pudo acceder al Administrador de credenciales: {error}"))?;
    let modifiers = HashMap::from([("persistence", "Local")]);
    let entry =
        keyring_core::Entry::new_with_modifiers(VAULT_KEY_SERVICE, VAULT_KEY_ACCOUNT, &modifiers)
            .map_err(|error| format!("No se pudo crear la entrada local de KNote: {error}"))?;

    match entry.get_secret() {
    Ok(key) if key.len() == 32 => Ok(key),
    Ok(_) => Err("La clave guardada de KNote no tiene un formato válido.".into()),
    Err(keyring::Error::NoEntry) if database_exists => Err(
      "El archivo KNote.knt existe, pero Windows ya no tiene su clave. No se ha modificado el archivo.".into(),
    ),
    Err(keyring::Error::NoEntry) => {
      let mut key = vec![0_u8; 32];
      getrandom::fill(&mut key)
        .map_err(|error| format!("No se pudo generar una clave segura: {error}"))?;
      entry
        .set_secret(&key)
        .map_err(|error| format!("Windows no pudo guardar la clave de KNote: {error}"))?;
      Ok(key)
    }
    Err(error) => Err(format!("No se pudo recuperar la clave de KNote: {error}")),
  }
}

fn open_encrypted_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = desktop_vault_path(app)?;
    let database_exists = path.exists();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("No se pudo crear la carpeta de datos de KNote: {error}"))?;
    }

    let mut key = load_or_create_key(database_exists)?;
    let mut key_hex = hex::encode(&key);
    key.zeroize();

    let connection = Connection::open(&path)
        .map_err(|error| format!("No se pudo abrir {}: {error}", path.display()))?;
    let mut key_statement = format!("PRAGMA key = \"x'{key_hex}'\";");
    key_hex.zeroize();
    let key_result = connection.execute_batch(&key_statement);
    key_statement.zeroize();
    key_result.map_err(|error| format!("No se pudo activar el cifrado de KNote: {error}"))?;
    connection
        .query_row("SELECT count(*) FROM sqlite_master", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|_| {
            "KNote.knt no se puede abrir con la clave de esta cuenta de Windows.".to_string()
        })?;

    connection
        .execute_batch(
            "PRAGMA cipher_memory_security = ON;
       PRAGMA journal_mode = DELETE;
       PRAGMA synchronous = FULL;
       PRAGMA secure_delete = ON;
       PRAGMA temp_store = MEMORY;
       PRAGMA cache_size = -2048;
       PRAGMA mmap_size = 0;
       CREATE TABLE IF NOT EXISTS workspace_state (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         data TEXT NOT NULL
       );
       CREATE TABLE IF NOT EXISTS assets (
         id TEXT PRIMARY KEY NOT NULL,
         mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
         content BLOB NOT NULL
       );",
        )
        .map_err(|error| format!("No se pudo preparar el archivo KNote.knt: {error}"))?;

    Ok(connection)
}

fn with_connection<T>(
    state: &VaultState,
    operation: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    if let Some(reason) = &state.unavailable_reason {
        return Err(reason.clone());
    }
    let connection = state
        .connection
        .lock()
        .map_err(|_| "El almacén local no está disponible.".to_string())?;
    let connection = connection
        .as_ref()
        .ok_or_else(|| "El almacén local no está disponible.".to_string())?;
    operation(connection)
}

#[tauri::command]
fn load_workspace(state: State<'_, VaultState>) -> Result<Option<Value>, String> {
    with_connection(&state, |connection| {
        let encoded = connection
            .query_row("SELECT data FROM workspace_state WHERE id = 1", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(|error| format!("No se pudo leer el espacio de trabajo: {error}"))?;
        encoded
            .map(|value| {
                serde_json::from_str(&value).map_err(|error| {
                    format!("Los datos de KNote no se pueden interpretar: {error}")
                })
            })
            .transpose()
    })
}

#[tauri::command]
fn save_workspace(snapshot: String, state: State<'_, VaultState>) -> Result<(), String> {
    with_connection(&state, |connection| {
        connection
            .execute(
                "INSERT INTO workspace_state (id, data) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                params![snapshot],
            )
            .map(|_| ())
            .map_err(|error| format!("No se pudo guardar el espacio de trabajo: {error}"))
    })
}

#[tauri::command]
fn save_asset(
    id: String,
    mime_type: String,
    bytes: Vec<u8>,
    state: State<'_, VaultState>,
) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("El identificador de imagen no es válido.".into());
    }
    if mime_type.len() > 120 || (!mime_type.is_empty() && !mime_type.starts_with("image/")) {
        return Err("El tipo de imagen no es válido.".into());
    }
    with_connection(&state, |connection| {
        connection
            .execute(
                "INSERT INTO assets (id, mime_type, content) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET mime_type = excluded.mime_type, content = excluded.content",
                params![id, mime_type, bytes],
            )
            .map(|_| ())
            .map_err(|error| format!("No se pudo guardar la imagen: {error}"))
    })
}

#[tauri::command]
fn get_asset(id: String, state: State<'_, VaultState>) -> Result<Option<StoredAsset>, String> {
    with_connection(&state, |connection| {
        connection
            .query_row(
                "SELECT mime_type, content FROM assets WHERE id = ?1",
                params![id],
                |row| {
                    Ok(StoredAsset {
                        mime_type: row.get(0)?,
                        bytes: row.get(1)?,
                    })
                },
            )
            .optional()
            .map_err(|error| format!("No se pudo leer la imagen: {error}"))
    })
}

#[tauri::command]
fn list_asset_ids(state: State<'_, VaultState>) -> Result<Vec<String>, String> {
    with_connection(&state, |connection| {
        let mut statement = connection
            .prepare("SELECT id FROM assets")
            .map_err(|error| format!("No se pudieron revisar las imágenes: {error}"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("No se pudieron revisar las imágenes: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("No se pudieron revisar las imágenes: {error}"))
    })
}

#[tauri::command]
fn delete_asset(id: String, state: State<'_, VaultState>) -> Result<(), String> {
    with_connection(&state, |connection| {
        connection
            .execute("DELETE FROM assets WHERE id = ?1", params![id])
            .map(|_| ())
            .map_err(|error| format!("No se pudo eliminar la imagen: {error}"))
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let opened = open_encrypted_database(&app.handle());
            let (connection, unavailable_reason) = match opened {
                Ok(connection) => (Some(connection), None),
                Err(reason) => (None, Some(reason)),
            };
            app.manage(VaultState {
                connection: Mutex::new(connection),
                unavailable_reason,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            save_asset,
            get_asset,
            list_asset_ids,
            delete_asset,
        ])
        .run(tauri::generate_context!())
        .expect("error while building KNote");
}
