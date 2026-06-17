const fs = require('fs');
const path = require('path');

const directServer = path.join(__dirname, 'server.js');
const nestedServer = path.join(__dirname, 'packages', 'frontend', 'server.js');
const serverPath = fs.existsSync(directServer) ? directServer : nestedServer;

if (!fs.existsSync(serverPath)) {
	throw new Error('Unable to find Next.js standalone server.js in frontend deploy artifact.');
}

require(serverPath);
