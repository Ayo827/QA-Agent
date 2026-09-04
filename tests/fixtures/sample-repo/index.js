const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");

const app = express();
app.get("/ping", (req, res) => res.send("pong"));

exports.dev = onRequest(app);
