// Main call
start().catch(console.error); // Start the application

// Settings:
const filter = false;

// Storage
// Console
const express = require('express');
const app = express();

// GPT4All
// Note that the gpt4all we are using has problems by default on windows, instructions for fix below:
// line 65: make sure there is a .exe extension like this -> "/.nomic/gpt4all.exe", this is only needed for windows users
const GPT = require('gpt4all').GPT4All;
const chat = new GPT('gpt4all-lora-unfiltered-quantized', true); // Default is 'gpt4all-lora-quantized' model

// queue's and busy booleans for all different parts
let tasksBusy  = { speaking: false, thinking: false, listening: false, console: false };
let tasksQueue = { speaking: []   , thinking: []   , listening: []   , console: []    };

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

async function init() {
   console.log("Initializing...");
   await sleep(1); // Wait a second to make sure the chatbot is initialized, just in case
   await chat.init(); // Initialize and download missing files
   console.log("Opening...");
   await chat.open(); // Open the connection with the model
   console.log("Initialized!");
}

function isBusy() { return tasksBusy.speaking || tasksBusy.thinking || tasksBusy.listening || tasksBusy.server; }

async function start() {
   await init();

   // Loop until finished
   while (isBusy()) {}

   chat.close();

   // TODO: implement loading all the parts
}

function parseCommand(cmd) {
   // TODO: implement basic command parsing
}

////////////////////
// Text To Speech //
////////////////////

// tasksBusy.speaking = true;
// TODO: implement

/////////
// GPT //
/////////

// tasksBusy.thinking = true;
// TODO: implement

///////////////////////
// Voice recognition //
///////////////////////

// tasksBusy.listening = true;
// TODO: implement

////////////////////////
// Knowledge database //
////////////////////////

// TODO: implement

///////////////////
// Control panel //
///////////////////

app.set('view engine', 'ejs');

app.get(/.*$/, (req, res) => {
   parseCommand(req.url);
   res.render("index"); // Renders the bots console to the user
});

app.listen(3000, () => { tasksBusy.server = true; });

function stopServer() { tasksBusy.server = false; }

///////////
// Utils //
///////////

async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }