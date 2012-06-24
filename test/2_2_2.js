var sip = require('../sip.js');
var assert = require('assert');
var udp = require('../udp.js');
var util = require('util');
var net = require('net');

var msg = {
  uri: 'sip:test',
  method: 'OPTIONS',
  version: "2.0",
  headers: {
    via: [{version: "2.0", protocol: 'UDP', host: 'localhost', port: 5060, params: {branch:'12345'}}],
    'content-length': 0,
  },
  content: ''
};

var transport = sip.makeTransport({}, function() {});

var server = net.createServer(function(stream) {
  stream.setEncoding('ascii')
  stream.on('data', sip.makeStreamParser(function(m) {
    assert.deepEqual(m, msg);
    transport.destroy();
    stream.end();
    server.close();
    util.print('PASSED\n');
  }));
});

server.listen(5061);

transport.send({protocol: 'TCP', address: '127.0.0.1', port: 5061}, msg);

