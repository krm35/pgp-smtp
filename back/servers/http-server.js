const path = require('path'),
    fs = require('fs'),
    querystring = require('querystring'),
    uws = require('uWebSockets.js'),
    c = require("../constants"),
    w = require("../words"),
    cors = require('../utilities/cors'),
    router = require('../router'),
    {isConnectedAsync} = require('../utilities/checkClient'),
    WebSocketServer = require('./ws-server');

process.on('uncaughtException', function (err) {
    console.log('uncaughtException', err);
});

function sendFile(res, fileName) {
    res.writeStatus('200 OK')
        .writeHeader("Content-Type", extensions[path.extname(fileName)])
        .end(router['files'][fileName]);
}

uws['App']({
    ...(!c.ssl ? {} : {
        secure: c.ssl,
        key_file_name: fs.readFileSync(c.sslKey),
        cert_file_name: fs.readFileSync(c.sslCert),
    })
}).ws('/*', {
    upgrade: async (res, req, context) => {
        res.onAborted(() => {
            res.aborted = true;
        });
        const key = req.getHeader('sec-websocket-key');
        const protocol = req.getHeader('sec-websocket-protocol');
        const extensions = req.getHeader('sec-websocket-extensions');
        req.cookie = req.getHeader('cookie');
        req.query = req.getQuery();
        const session = await getUser(req);
        if (!session || !session['id']) return res.close();
        res.upgrade(
            {session, key},
            key,
            protocol,
            extensions,
            context
        );
    },
    open: (ws) => {
        // noinspection JSIgnoredPromiseFromCall
        WebSocketServer.open(ws);
    },
    message: (ws, message) => {
        // noinspection JSIgnoredPromiseFromCall
        WebSocketServer.message(ws, Buffer.from(message).toString());
    },
    close: (ws) => {
        WebSocketServer.close(ws);
    }
}).any('/*', async (res, req) => {

    res.onAborted(() => {
        res.aborted = true;
    });

    const method = req.getMethod().toLowerCase(),
        url = req.getUrl().substring(1),
        origin = req.getHeader('origin');

    req.cookie = req.getHeader('cookie');
    req.query = req.getQuery();

    if (method === 'options') {
        answer(req, res, origin, false);
    } else if (url === 'upload' && method === 'post') {
        const buffer = [];
        res.onData((chunk, isLast) => {
            buffer.push(new Uint8Array(chunk.slice(0)));
            if (isLast) {
                const body = querystring.parse(req['query']);
                handleRequest(req, res, method, body['action'], origin, {buffer, ...body});
            }
        });
        res.onAborted(() => {
            answer(req, res, origin, true, w.UNKNOWN_ERROR);
        });
    } else if (method === 'post' || method === 'put') {
        readJson(res, async (obj) => {
            await handleRequest(req, res, method, url, origin, obj);
        }, () => {
        });
    } else {
        if (!router[url]) {
            sendFile(res, path.basename(req.getUrl()).split('?')[0] || "index.html");
        } else {
            await handleRequest(req, res, method, url, origin, querystring.parse(req.getQuery()));
        }
    }

}).listen(c.httpPort, (listenSocket) => {
    if (!listenSocket) {
        console.log("failed to listenSocket");
        process.exit(0);
    }
});

async function getUser(req) {
    return isConnectedAsync(req.cookie);
}

async function handleRequest(req, res, method, url, origin, body) {
    try {
        const user = !router['noUserCheck'][url] ? (await getUser(req)) : {};
        if (!router['noUserCheck'][url] && (!user || !user['id'])) {
            return answer(req, res, origin, true, w.UNAUTHORIZED_OPERATION);
        }
        router[url](user['id'], body, (error, data) => {
                answer(req, res, origin, error, data)
            }, {req, res, url, origin}
        ).catch((e) => {
            if (!w[e] && c.isDev) console.log(e);
            answer(req, res, origin, true, w[e] || w.UNKNOWN_ERROR);
        });
    } catch (e) {

    }
}

const answer = function (req, res, origin, error, data) {
    if (res['headerWritten'] !== true) {
        res.writeStatus('200 OK');
        res.writeHeader("Content-Type", "application/json");
        const headers = {...(res['headerWritten'] || {}), ...cors(origin)};
        for (let i in headers) res.writeHeader(i, "" + headers[i]);
        if (!res.aborted) {
            if (error !== undefined) res.end(JSON.stringify({error, data}));
            else res.end();
        }
    }
};

function readJson(res, cb, err) {
    let buffer;
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab);
        if (isLast) {
            try {
                cb(JSON.parse("" + (buffer ? Buffer.concat([buffer, chunk]) : chunk)));
            } catch (e) {
                res.close();
            }
        } else {
            buffer = Buffer.concat(buffer ? [buffer, chunk] : [chunk]);
        }
    });
    res.onAborted(err);
}

const extensions = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".csv": "text/csv",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ttf": "font/font-sfnt",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".cur": "image/x-icon",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".json": "application/json",
    ".pdf": "application/pdf",
};