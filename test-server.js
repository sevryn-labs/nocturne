const { execSync } = require('child_process');
require('./lending-api/dist/server.js');
setTimeout(() => {
  console.log(process._getActiveHandles().map(h => h.constructor.name));
}, 100);
