import { handleCloudRequest } from '../../server/cloud-router.js';

export const POST = (request: Request) => handleCloudRequest(request);
