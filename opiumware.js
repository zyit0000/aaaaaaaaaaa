const Net = require("net");
const Zlib = require("zlib");

async function execute(Code, Port) {
    const Ports = ["8392", "8393", "8394", "8395", "8396", "8397"];
    let ConnectedPort = null,
        Stream = null;

    for (const P of (Port === "ALL" ? Ports : [Port])) {
        try {
            Stream = await new Promise((Resolve, Reject) => {
                const Socket = Net.createConnection({
                    host: "127.0.0.1",
                    port: parseInt(P)
                }, () => Resolve(Socket));
                Socket.on("error", Reject);
            });
            console.log(`Successfully connected to Opiumware on port: ${P}`);
            ConnectedPort = P;
            break;
        } catch (Err) {
            console.log(`Failed to connect to port ${P}: ${Err.message}`);
        }
    }

    if (!Stream) return "Failed to connect on all ports";

    if (Code !== "NULL") {
        try {
            await new Promise((Resolve, Reject) => {
                Zlib.deflate(Buffer.from(Code, "utf8"), (Err, Compressed) => {
                    if (Err) return Reject(Err);
                    Stream.write(Compressed, (WriteErr) => {
                        if (WriteErr) return Reject(WriteErr);
                        console.log(`Script sent (${Compressed.length} bytes)`);
                        Resolve();
                    });
                });
            });
        } catch (Err) {
            Stream.destroy();
            return `Error sending script: ${Err.message}`;
        }
    }

    Stream.end();
    return `Successfully connected to Opiumware on port: ${ConnectedPort}`;
}


execute("OpiumwareScript print('pmo')", "ALL") // ALL or 8392 to 8397
    .then(result => {
        console.log("Result:", result);
    })
    .catch(err => {
        console.error("Error:", err);
    });

execute("OpiumwareSetting RedirectErrors true", "ALL") // ALL or 8392 to 8397
    .then(result => {
        console.log("Result:", result);
    })
    .catch(err => {
        console.error("Error:", err);
    });

execute("OpiumwareSetting WSToggle false", "ALL") // ALL or 8392 to 8397
    .then(result => {
        console.log("Result:", result);
    })
    .catch(err => {
        console.error("Error:", err);
    });