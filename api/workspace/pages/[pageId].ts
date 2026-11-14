import { handleCloudRequest } from '../../../server/cloud-router.js';

export const PUT = (request: Request) => handleCloudRequest(request);
export const DELETE = (request: Request) => handleCloudRequest(request);
