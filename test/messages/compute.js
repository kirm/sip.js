"use strict";
//Compute .json

let fs= require("fs");
let path = require("path");
let sip = require("../../");

//let encoding= "ascii";
let encoding= "utf8";


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

console.log("DONE " + encoding);

