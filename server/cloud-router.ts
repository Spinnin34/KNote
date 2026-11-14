import { cloudError } from './cloud-http.js';
import { handleSharingRoute } from './cloud-sharing.js';
import { handleWorkspaceRoute } from './cloud-workspace.js';

export async function handleCloudRequest(request: Request, path = new URL(request.url).pathname): Promise<Response> {
  try {
    const workspaceResponse = await handleWorkspaceRoute(request, path);
    if (workspaceResponse) return workspaceResponse;
    const sharingResponse = await handleSharingRoute(request, path);
    if (sharingResponse) return sharingResponse;
    return cloudError('Ruta no encontrada.', 404);
  } catch (error) {
    console.error('[KNote cloud] Request failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return cloudError('No se pudo completar la operación en la nube.', 503);
  }
}
