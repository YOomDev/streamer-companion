// Main call
start(); // Start the application

// Settings:
// TODO

////////////////////////
// Streamer companion //
////////////////////////

// TODO  list:
/* Setup console
 * Add TTS
 * Setup knowledge database system
 * Setup filters for output
 * Add voice recognition
 */

function start() {
   // TODO: implement loading all the parts
}

function parseCommand(cmd) {
   // TODO: implement basic command parsing
}

////////////////////////
// Knowledge database //
////////////////////////

// TODO: implement

///////////////////
// Control panel //
///////////////////

const express = require('express');
const app = express();
app.set('view engine', 'ejs');

app.get(/.*$/, (req, res) => {
   parseCommand(req.url);
   res.render("index"); // Renders the bots console to the user
});

app.listen(3000);