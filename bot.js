// Project info:
/* .
 * .
 */

//////////////
// Settings //
//////////////

const filter = false;

////////////////////////////////
// Memory for running the bot //
////////////////////////////////

// Console
const express = require('express');
const app = express();

// GPT4All
// Note that the gpt4all we are using has problems by default on windows, instructions for fix below:
// line 65: make sure there is a .exe extension like this -> "/.nomic/gpt4all.exe", this is only needed for Windows users
const GPT = require('gpt4all').GPT4All;
const chat = new GPT('gpt4all-lora-unfiltered-quantized', true); // Default is 'gpt4all-lora-quantized' model

// Text To Speech
const say = require('say');
let voicesList = [];
say.speak("Initializing", null, 2.0, (err) => { if (err) { return console.error(err) } });
function getVoices() { return new Promise((resolve) => { say.getInstalledVoices((err, voice) => { if (err) { console.error(err); } return resolve(voice); }) }) }
async function usingVoices() { voicesList = await getVoices(); console.log(voicesList) }

// Queue's and busy booleans for all different parts
let tasksBusy  = { speaking: false, thinking: false, listening: false, console: false };
let tasksQueue = { speaking: []   , thinking: []   , listening: []   , console: []    };

////////////////////////
// Streamer companion //
////////////////////////

// TODO  list:
/* Setup console
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
   console.log("Voices:");
   await usingVoices();
   console.log("Initialized!");
}

function isBusy() { return tasksBusy.speaking || tasksBusy.thinking || tasksBusy.listening || tasksBusy.server; }

async function start() {
   await init(); // Make sure the modules are initialized correctly
   while (isBusy()) {} // Loop until finished

   // Make sure the modules are closed correctly
   chat.close();
   stopServer();
}

function parseCommand(cmd) {
   console.log(cmd);
   const params = cmd.substring(1,cmd.length).split("\/");
   console.log(params);
   if (equalsCaseSensitive(params[0], "cmd")) {
      switch (params[1]) {
         case "say": {

         }
         case "start":
            start().catch((err) => { console.error(err); });
            break;
         default:
            break;
      }
   }
}

////////////////////
// Text To Speech //
////////////////////

// tasksBusy.speaking = true;
// TODO: implement

function speak(message) {
   tasksQueue.speaking.push(message);
   if (!tasksBusy.speaking) { speakQueue(); }
}

function speakQueue() {
   tasksBusy.speaking = true;
   const msg = tasksQueue.speaking[0];
   tasksQueue.speaking.splice(0,1);
   say.speak(msg, null, 1.0, (err) => {
      if (err) { tasksBusy.speaking = false; console.error(err); }
      if (tasksQueue.speaking.length > 0) { speakQueue(); }
      else { tasksBusy.speaking = false; }
   });
}

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

// info:
/* can load modules and keep the names and index pages in memory
 * loads only the needed memory parts of the modules when requested and doesn't keep them in memory
 * needs to be able to get knowledge from parent items, like when thinking of planks it needs to know things about logs and trees and such
 */

///////////////////
// Control panel //
///////////////////

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

app.get("/cmd/*", (req, res) => {
   res.redirect("/"); // redirects back to the home page
   console.log(tasksBusy.console);
   parseCommand(req.url);
});

app.get("/", (req, res) => { res.render("index"); tasksBusy.console = true; }); // Renders the bots console to the user

app.listen(3000, () => { tasksBusy.server = true; });

function stopServer() { tasksBusy.server = false; }

///////////
// Utils //
///////////

async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }

function equalsCaseSensitive(first, second) {
   if (first.length !== second.length) { return false; }
   console.log(first + "?" + second);
   for (let i = 0; i < first.length; i++) { if (first[i] !== second[i]) { console.log(first[i] + "?" + second[i]); return false; } }
   return true;
}