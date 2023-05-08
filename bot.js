// Project info:
/*
 */

//////////////
// Settings //
//////////////

const filter = false; // Turns the response speech filter on or off

// Priority types for usage when you connect it to a chat with viewers or some other chat sort
const PRIO_DEV = "dev";
const PRIO_CHAT = "chat";

// Priorities for prompt ordering
const PRIORITIES = [
   PRIO_DEV,
   PRIO_CHAT,
];

// Filtering
const filteredMessage = "*Filtered*";
const FILTERED = [
    "test",
];

////////////////////////////////
// Memory for running the bot //
////////////////////////////////

// Console
const http = require('http');
const express = require('express');
const app = express();

// GPT4All
// Note that the gpt4all we are using has problems by default on windows, instructions for fix below:
// line 65: make sure there is a .exe extension like this -> "/.nomic/gpt4all.exe", this is only needed for some Windows users
const GPT = require('gpt4all').GPT4All;
const chat = new GPT('gpt4all-lora-unfiltered-quantized', true); // Default is 'gpt4all-lora-quantized' model

// Text To Speech
const say = require('say');
let voicesList = [];
// say.speak("Initializing", null, 2.0, (err) => { if (err) { return console.error(err) } });
function getVoices() { return new Promise((resolve) => { say.getInstalledVoices((err, voice) => { if (err) { console.error(err); } return resolve(voice); }) }) }
async function usingVoices() { voicesList = await getVoices(); console.log(voicesList) }

// Queue's and busy booleans for all different parts
let tasksBusy  = { speaking: false, thinking: false, listening: false, console: false };
let tasksQueue = { speaking: []   , thinking: []   , listening: []   , console: []    };
let program = null;

////////////////////////
// Streamer companion //
////////////////////////

// TODO  list:
/* Setup knowledge database system
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

// Used to check if the AI interface and speaking interface are meant to be kept alive
function isBusy() { return tasksBusy.speaking || tasksBusy.thinking || tasksBusy.listening || tasksBusy.server; }

async function start() {
   await init(); // Make sure the modules are initialized correctly
   while (isBusy()) { await sleep(2); } // Loop until finished

   // Make sure the modules are closed correctly
   chat.close();
   program = null;
}

function parseCommand(cmd) {
   console.log(cmd);
   const params = cmd.substring(1,cmd.length).split("\/");
   console.log(params);
   if (equalsCaseSensitive(params[0], "cmd")) {
      switch (params[1]) {
         case "ask":
            ask(PRIO_DEV, concatenate(params, 2));
            break;
         case "say":
            speak(concatenate(params, 2));
            break;
         case "start":
            if (program === null) { program = start(); }
            break;
         case "stop":
            stopServer();
            break;
         default:
            break;
      }
   }
}

////////////////////
// Text To Speech //
////////////////////

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

const allowedCharacters = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz.,:;[]!?(){}=-+<>*%^&$#@!|`\'\"/\\ 0123456789";
const capitalCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function ask(author, prompt, spoken = true) {
   tasksQueue.thinking.push( { author: author, prompt: prompt, spoken: spoken} );
   if (!tasksBusy.thinking) { askQueue().then(() => {}); }
   console.log("added question");
}

async function askQueue() {
   let current = 0;
   while(tasksQueue.thinking.length > 0) {
      tasksBusy.thinking = true;
      current = getHighestQueueByPriority();
      await chatPrompt(tasksQueue.thinking[current].prompt, tasksQueue.thinking[current].spoken);
      tasksQueue.thinking.splice(current, 1);
   }
   tasksBusy.thinking = false;
}

async function chatPrompt(prompt, spoken) {
   console.log(`Prompt: ${prompt}`);
   console.time('response');
   const response = await chat.prompt(prompt);
   console.timeEnd('response');
   const result = cleanResponse(response);
   if (spoken) { speak(filterResponse(result)); }
   console.log(`Response: ${result}`);
}

function getHighestQueueByPriority() {
   let topPrio = 1000000000;
   let top = 0;
   for (let i = 0; i < tasksQueue.thinking.length; i++) {
      const prio = PRIORITIES.indexOf(tasksQueue.thinking[i].author);
      if (prio === 0) { return i; }
      if (prio < topPrio) {
         topPrio = prio;
         top = i;
      }
   }
   return top;
}

// Used to filter the responses if the setting is turned on so that it can be used in situations where the AI is not allowed to say certain things
function filterResponse(response) { return (filter && containsFromList(response, FILTERED, true)) ? filteredMessage : response; }

// Used to clean the response from gpt4all since it usually includes some gibberish from piping the text to this application
function cleanResponse(response) {
   let result = "";
   for (let i = 0; i < response.length; i++) { if (allowedCharacters.indexOf(response[i]) >= 0) { result += response[i]; } }
   return result.substring(findFirstCapitalCharacter(result), result.length - 1);
}

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

// Setup express for usage
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

// Set command interface through page get
app.get("/cmd/*", (req, res) => {
   res.redirect("/"); // redirects back to the home page
   console.log(tasksBusy.console);
   parseCommand(req.url);
});

// Set main page get implementation
app.get("/", (req, res) => { res.render("index"); tasksBusy.console = true; }); // Renders the bots console to the user

// Start the server
const server = http.createServer(app);
server.listen(3000, () => { tasksBusy.server = true; });

// Used to kill the server
function stopServer() { tasksBusy.server = false; server.close(); }

///////////
// Utils //
///////////

async function sleep(seconds) { return new Promise((resolve) => setTimeout(resolve, seconds * 1000)); }

function equalsCaseSensitive(first, second) {
   switch(first) {
      case second: return true;
      default: return false;
   }
}

function concatenate(list, start = 0, end = 0) {
   if (end === 0) { end = list.length; } else if (list.length) { end = Math.min(end + 1, list.length); } // Make sure it doesn't go out of the arrays bounds
   let result = "";
   for (let i = start; i < end; i++) { result += (i !== start ? " " : "") + list[i]; }
   return result;
}

function findFirstCapitalCharacter(str) { return findCapitalCharacter(str, 0); }

function findCapitalCharacter(str, start) { for (let i = start; i < str.length; i++) { if (capitalCharacters.indexOf(str[i]) >= 0) { return i; } } return start; }

function containsFromList(txt, list, ignoreCase = false) {
   for (let i = 0; i < list.length; i++) {
      if (txt.indexOf(list[i])) { return true; }
      else if (ignoreCase) { if (txt.toLowerCase().indexOf(list[i].toLowerCase())) { return true; } }
   }
   return false;
}