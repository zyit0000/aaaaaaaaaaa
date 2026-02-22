const Net = require("net");
const Zlib = require("zlib");

const DEFAULT_PORTS = ["8392", "8393", "8394", "8395", "8396", "8397"];

function connectPort(port) {
  return new Promise((resolve, reject) => {
    const socket = Net.createConnection(
      { host: "127.0.0.1", port: parseInt(port, 10) },
      () => resolve(socket)
    );
    socket.on("error", reject);
  });
}

async function attach(port = "ALL") {
  const targets = port === "ALL" ? DEFAULT_PORTS : [String(port)];
  for (const current of targets) {
    try {
      const stream = await connectPort(current);
      stream.end();
      return { ok: true, port: current, message: `Attached on ${current}` };
    } catch {
      // try next port
    }
  }
  return { ok: false, port: null, message: "Failed to attach on all ports" };
}

async function execute(code, port = "ALL") {
  if (typeof code !== "string") {
    return { ok: false, port: null, message: "Code must be a string" };
  }
  const targets = port === "ALL" ? DEFAULT_PORTS : [String(port)];

  for (const current of targets) {
    try {
      const stream = await connectPort(current);
      const compressed = await new Promise((resolve, reject) => {
        Zlib.deflate(Buffer.from(code, "utf8"), (err, out) => {
          if (err) reject(err);
          else resolve(out);
        });
      });
      await new Promise((resolve, reject) => {
        stream.write(compressed, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      stream.end();
      return { ok: true, port: current, message: `Executed on ${current}` };
    } catch {
      // try next port
    }
  }
  return { ok: false, port: null, message: "Failed to execute on all ports" };
}

module.exports = {
  DEFAULT_PORTS,
  attach,
  execute,
};
