var crypto = require('crypto');
var util = require('util');

function unq(a) {
  if(a && a[0] === '"' && a[a.length-1] === '"')
    return a.substr(1, a.length - 2);
  return a;
}

function q(a) {
  if(a && a[0] !== '"')
    return ['"', a, '"'].join('');

  return a;
}

function kd() {
  var hash = crypto.createHash('md5');

  hash.update(arguments[0]);

  Array.prototype.slice.call(arguments, 1).forEach(
    function(a) {
      hash.update(':');
      hash.update(a);
    }
  );

  return hash.digest('hex');
}

exports.kd = kd;

function calculateUserRealmPasswordHash(user, realm, password) {
  return kd(unq(user), unq(realm), unq(password));
}

function calculateResponse(ha1, method, nonce, nc, cnonce, qop, uri, entity) {
  switch(qop) {
  case 'auth-int':
    return kd(ha1, nonce, nc, cnonce, qop, kd(method, uri, kd(entity)));
  case 'auth':
    return kd(ha1, nonce, nc, cnonce, qop, kd(method, uri));
  }

  return kd(ha1, nonce, kd(method, uri));
}

function numberTo8Hex(n) {
  n = n.toString(16);
  return '00000000'.substr(n.length) + n;
}

function checkQop(context, auth) {
  if(Array.isArray(context)) {
    return context.indexOf(auth) !== -1;
  }

  return context === auth;
}

exports.server = {
  makeAuthenticateHeader: function(context) {
    return {
      scheme: "Digest",
      realm: q(context.realm),
      nonce: q(context.nonce),
      qop: q(context.qop),
      algorithm: context.algorithm
    };
  },
  authenticate: function(context, rq, authorization) {
    if(context.nonce != unq(authorization.nonce))
      return false;

    if(context.nc && context.nc !== parseInt(authorization.nc, 16))
      return false;
   
    var cnonce = unq(authorization.cnonce); 
    if(context.cnonce && cnonce !== context.cnonce)
      return false;

    if(context.qop && !checkQop(context.qop, unq(authorization.qop)))
      return false;

    if(context.algorithm && unq(authorization.algorithm.toLowerCase()) !== context.algorithm.toLowerCase())
      return false;

    var ha1 = context.ha1;
    if(!ha1) {
      ha1 = context.userhash || calculateUserRealmPasswordHash(context.user, context.realm, context.passwd);
      if(context.algorithm.toLowerCase() === 'md5-sess') 
        ha1 = kd(ha1, context.nonce, cnonce);
    }

    var digest = calculateResponse(ha1, rq.method, context.nonce, authorization.nc, cnonce, unq(authorization.qop), unq(authorization.uri), rq.content);
    if(digest === unq(authorization.response)) {
      context.ha1 = ha1;
      context.nc = parseInt(authorization.nc, 16) + 1;
      context.cnonce = cnonce;
      context.uri = unq(authorization.uri);
      context.qop = unq(authorization.qop);
      return true;
    }
    return false;
  },
  makeAuthenticationInfoHeader: function(context, mutual, message) {
    var rspauth;

    if(mutual)
      rspauth = calculateResponse(context.ha1, '', context.nonce, numberTo8Hex(context.nc),
        context.cnonce, context.qop, context.uri, message ? message.content : '');

    return {
      scheme: "Digest",
      nextnonce: q(context.nonce),
      cnonce: q(context.cnonce),
      nc: numberTo8Hex(context.nc),
      qop: q(context.qop),
      algorithm: context.algorithm,
      rspauth: q(rspauth)
    };
  }
};

