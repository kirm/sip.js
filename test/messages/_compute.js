"use strict";
/*
Compute .json

This script will parse the raw sip messages *.dat that are present
in this directory and export the result in a file *.json.
Note that an empty file .json has to be present in the dir.

Be careful, check that the .json generated match the value 
that is actually expected.

*/

let fs= require("fs");
let path = require("path");
let sip = require("../../");

let encoding= "binary";

let files = fs.readdirSync(__dirname);

let names = [];

for (let file of files) {

    if (path.extname(file) !== ".json") continue;

    names.push(path.basename(file, ".json"));

}

for (let name of names) {
    
    console.log(`${name}.dat => sip.parse => ${name}.json`);

    let dat = fs.readFileSync(
        path.join(__dirname, `${name}.dat`),
        encoding
    );

    let json = JSON.stringify(sip.parse(dat), null, 2);

    fs.writeFileSync(
        path.join(__dirname, `${name}.json`),
        json,
        { "encoding": encoding }
    );

}

console.log("DONE");