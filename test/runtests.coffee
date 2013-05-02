#!/usr/bin/env coffee

util = require('util')

runTests = (tests) ->
  if tests.length is 0
    process.exit()
  else
    tests[0] () ->
      console.log 'ok'
      runTests tests[1...tests.length]

modules = process.argv[2..process.argv.length]

if modules.length == 0
  modules = ['parser', 'digest', 'rport']

console.log modules

tests = (modules.map (a) -> require('./' + a).tests).reduce (a,b) -> a.concat b

runTests tests
