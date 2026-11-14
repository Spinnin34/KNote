import { handleCloudRequest } from '../../server/cloud-router.js';

export const GET = (request: Request) => handleCloudRequest(request);
export const HEAD = (request: Request) => handleCloudRequest(request);
