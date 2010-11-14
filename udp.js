var utils = require('util');

var events = require('events');

try {
var IOWatcher    = process.binding('io_watcher').IOWatcher;
} 
catch(e) {
var IOWatcher    = process.IOWatcher;
}
var binding      = process.binding('net');
var socket       = binding.socket;
var recvfrom     = binding.recvfrom;
var close        = binding.close;

var pool = null;

function getPool() {
  /* TODO: this effectively limits you to 8kb maximum packet sizes */
  var minPoolAvail = 1024 * 8;

  var poolSize = 1024 * 64;

  if (pool === null || (pool.used + minPoolAvail  > pool.length)) {
    pool = new Buffer(poolSize);
    pool.used = 0;
  }

  return pool;
}

function Socket(listener) {
  events.EventEmitter.call(this);
  var self = this;
  self.fd = socket('udp4');

  if(typeof listener === 'function')
    self.on('message', listener);

  self.watcher = new IOWatcher();
  self.watcher.host = self;
  self.watcher.callback = function() {
    try {
      while(self.fd) {
        var p = getPool();
        var rinfo = recvfrom(self.fd, p, p.used, p.length-p.used, 0);
       
        if(!rinfo) return;

        self.emit('message', p.slice(p.used, p.used + rinfo.size), rinfo);

        p.used += rinfo.size;
      }
    }
    catch(e) {
      self.emit('error', e);
    } 
  };

  self._startWatcher();
}

utils.inherits(Socket, events.EventEmitter);
exports.Socket = Socket;

exports.createSocket = function (listener) {
  return new Socket(listener);
};

Socket.prototype.bind = function(port, address) {
  binding.bind(this.fd, port, address);
  this.emit('listening');
}

Socket.prototype.connect = function(port, address) {
  binding.connect(this.fd, port, address);
}

Socket.prototype._startWatcher = function () {
  if(!this._watcherStarted) {
    this.watcher.set(this.fd, true, false); // listen for read ready, not write ready
    this.watcher.start();
    this._watcherStarted = true;
  }
};

Socket.prototype.address = function () {
  return binding.getsockname(this.fd);
};

Socket.prototype.setBroadcast = function(arg) {
  if (arg) {
    return binding.setBroadcast(this.fd, 1);
  } else {
    return binding.setBroadcast(this.fd, 0);
  }
};

Socket.prototype.setTTL = function(arg) {
  var newttl = parseInt(arg);
  
  if (newttl > 0 && newttl < 256) {
    return binding.setTTL(this.fd, newttl);
  } else {
    throw new Error("New TTL must be between 1 and 255");
  }
};

Socket.prototype.sendto = function(buffer, offset, length, port, addr, callback) {
  if (typeof offset !== "number" || typeof length !== "number") {
    throw new Error("send takes offset and length as args 2 and 3");
  }

  try {
    var bytes = binding.sendto(this.fd, buffer, offset, length, 0, port, addr);
  }
  catch(err) {
    if (callback) {
      callback(err);
    }
    return;
  }

  if(callback) {
    callback(null, bytes);
  }
};

Socket.prototype.send = function(buffer, offset, length, callback) {
  if (typeof offset !== "number" || typeof length !== "number") {
    throw new Error("send takes offset and length as args 2 and 3");
  }

  try {
    var bytes = binding.sendMsg(this.fd, buffer, offset, length);
  }
  catch(err) {
    if (callback) {
      callback(err);
    }
    return;
  }
 
  if(callback) {
    callback(null, bytes);
  }
};

Socket.prototype.shutdown = function() {
  binding.shutdown(this.fd, "readwrite"); 
}

Socket.prototype.close = function () {
  if (!this.fd) throw new Error('Not running');

  this.watcher.stop();
  this._watcherStarted = false;

  close(this.fd);
  this.fd = null;

  this.emit("close");
};

