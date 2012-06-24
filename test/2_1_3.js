var sip = require('../sip.js');
var assert = require('assert');
var udp = require('../udp.js');
var util = require('util');

var msg = {
  uri: 'sip:test',
  method: 'OPTIONS',
  version: "2.0",
  headers: {
    via: [{version: "2.0", protocol: 'UDP', host: 'localhost', port: 5060, params: {branch:'12345'}}],
  },
  content: ''
};

var transport = sip.makeTransport({}, function() {});

var cn = transport.open({protocol: 'UDP', address: '127.0.0.1', port: 5061}, function(e) {
  assert.ok(e.errno === process.ECONNREFUSED);
  util.print('PASSED\n');
  cn.release();
  transport.destroy();
});

cn.send(msg);
