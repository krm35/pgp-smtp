const fs = require('fs'),
    secret = __dirname + "/secrets.json",
    map = {};

map.__dirname = __dirname + "/attachments/";
map.domain = "@localhost.com";
map.host = "127.0.0.1";
map.ssl = false;
map.sslKey = "";
map.sslCert = "";
map.smtpPort = 2525;
map.httpPort = 8080;
map.sendmailConf = {
    silent: true,
    devHost: 'localhost',
    devPort: 2525,
    rejectUnauthorized: false,
};
map.redisConf = {
    port: 6379
};
map.isDev = !fs.existsSync(secret);

if (!map.isDev) {
    const secrets = JSON.parse("" + fs.readFileSync(secret));
    for (let i in secrets) map[i] = secrets[i];
}

if (map.sendmailConf.dkim) {
    if (fs.existsSync(map.sendmailConf.dkim.privateKey)) {
        map.sendmailConf.dkim.privateKey = fs.readFileSync(map.sendmailConf.dkim.privateKey, 'utf8');
    } else {
        delete map.sendmailConf.dkim;
    }
}

module.exports = map;