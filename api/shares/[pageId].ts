import { handleCloudRequest } from '../../server/cloud-router.js';

export const GET = (request: Request) => handleCloudRequest(request);
export const POST = (request: Request) => handleCloudRequest(request);
export const DELETE = (request: Request) => handleCloudRequest(request);
