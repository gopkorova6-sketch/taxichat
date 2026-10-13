const { expressServer } = require("./server");
const initSocket = require("./socket");

initSocket(expressServer);
