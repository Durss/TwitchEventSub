const express =  require('express');
const ngrok =  require('ngrok');
const fetch =  require('node-fetch');
const HmacSHA256 = require('crypto-js').HmacSHA256;

//Create a twitch APP to generate a client ID and a SECRET key.
//Also, define this URL as oAuth callbacks :
// http://localhost:3000/oauth 
//
//(make sure the port matches the one configured bellow)

//Port of the local server to create that will create the eventsub webhook
const SERVER_PORT = 3000;

//Create a (free) account on https://ngrok.com and generate a token
const NGROK_AUTH_TOKEN = "";

//Twitch user ID
const TWITCH_BROADCASTER_ID = "";

//Client ID of a twitch APP
const TWITCH_CLIENT_ID = "";

//Secret ID of a twitch APP
const TWITCH_CLIENT_SECRET = "";

//Key used to generate a validation hash. Write anything you want!
const TWITCH_EVENTSUB_SECRET = "";

//Events to subscribe to
//Full list available here : https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types
const EVENTS_TO_SUB_TO = [
							"channel.follow",
							// "channel.channel_points_custom_reward_redemption.add",
							// "channel.hype_train.begin",
							// "channel.poll.begin",
							// "channel.poll.progress",
							// "channel.poll.end",
							// "channel.prediction.begin",
							// "channel.prediction.progress",
							// "channel.prediction.lock",
							// "channel.prediction.end"
						];

//Twitch scopes to request access to.
//Full list available here : https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types
const TWITCH_SCOPES = [
							// "user:read:email",
							// "bits:read",
							// "channel:moderate",
							// "moderation:read",
							// "channel:read:subscriptions",
							// "channel:manage:redemptions",
							// "channel:manage:predictions",
							// "channel:manage:polls",
							// "channel:read:hype_train",
						].join("+");

/**
 * Function called everytime a new event is fired by twitch.
 * The duplicates filtering is already managed. (twitch sends one event multiple times)
 * Do what you want on this method
 */
function onEvent(data) {
	console.log(data);
}





//=========================================================
//=== YOU SHOULD NOT NEED TO CHANGE ANYTHING BELOW THIS ===
//=========================================================





let webhookUrl;
let twitchCredentialToken;
let parsedEvents = {};
const app = express();
app.use(express.json());

//Fake oauth callback page
app.get("/oauth", (req,res) => {
	res.status(200).json({success:true, message:"App is now authorized to access the requested scopes : "+TWITCH_SCOPES});
});

//Function called every time twitch sends an event
app.post("/api/eventsubcallback", (req,res) => {
	let json = req.body;

	let id = req.headers["twitch-eventsub-message-id"];
	if(parsedEvents[id] === true) {
		// console.log("Ignore", id);
		res.status(200);//Tell twitch to stop trying again and again and again and...
		return;
	}
	parsedEvents[id] = true;
	
	if(json.subscription.status == "webhook_callback_verification_pending") {
		//Challenging signature
		let sig = req.headers["twitch-eventsub-message-signature"];
		let ts = req.headers["twitch-eventsub-message-timestamp"];
		let hash = "sha256="+HmacSHA256(id+ts+JSON.stringify(req.body), TWITCH_EVENTSUB_SECRET).toString();
		if(hash != sig) {
			console.log(LogStyle.FgRed+"Invalid signature challenge"+LogStyle.Reset)
			res.status(401);
			return;
		}
		console.log(LogStyle.FgGreen+"EventSub challenge completed for "+json.subscription.type+LogStyle.Reset);
		res.status(200).send(req.body.challenge);

	}else{
		console.log(LogStyle.FgCyan+"New EventSub : "+json.subscription.type+LogStyle.Reset);
		onEvent(json.event);
	}
});

//Crate server
app.listen(SERVER_PORT, () => {
    console.log(LogStyle.FgGreen+'Server ready on PORT '+SERVER_PORT+LogStyle.Reset);
	start();
})

/**
 * Starts the eventsub process.
 * Creates the HTTPS webhook and subscribe to requested events after
 * unsubscribing to old ones.
 */
async function start() {
	webhookUrl = await ngrok.connect({authtoken: NGROK_AUTH_TOKEN, addr:SERVER_PORT, proto:"http"});

	//Authenticated
	await createTwitchClientCredentialToken();

	//Unsubs previous webhooks created by the twitch app
	if(!await unsubPrevious()) return;//If it returns false, it's because authentication failed

	//Subscribes to events with the newly created webhook URL
	for (let i = 0; i < EVENTS_TO_SUB_TO.length; i++) {
		await subToType(EVENTS_TO_SUB_TO[i]);
		
	}
}

/**
 * Creates a credential token
 */
async function createTwitchClientCredentialToken() {
	if(twitchCredentialToken) return Promise.resolve(twitchCredentialToken);
	return new Promise((resolve, reject) => {
		var options = {
			method: "POST",
			headers: {},
		};
		let url = "https://id.twitch.tv/oauth2/token?client_id="+TWITCH_CLIENT_ID+"&client_secret="+TWITCH_CLIENT_SECRET+"&grant_type=client_credentials&scope="+TWITCH_SCOPES;
		fetch(url, options)
		.then(async (result) => {
			if(result.status == 200) {
				let json = await result.json()
				twitchCredentialToken = json.access_token;
				// console.log("\n\n");
				// console.log(json.scope);
				// console.log("\n\n");
				resolve(json.access_token);
			}else{
				console.log(LogStyle.FgRed+"TOKEN creation failed"+LogStyle.Reset);
				console.log(await result.text());
				reject();
			}
		}).catch(error=> {
			console.log(error);
		});
	})
}

/**
 * Unsubscribes previous webhooks
 */
async function unsubPrevious() {
	let opts = {
		method:"GET",
		headers:{
			"Client-ID": TWITCH_CLIENT_ID,
			"Authorization": "Bearer "+twitchCredentialToken,
			"Content-Type": "application/json",
		}
	}
	let list = [];
	let json, cursor;
	do {
		let url = "https://api.twitch.tv/helix/eventsub/subscriptions";
		if(cursor) {
			url += "?after="+cursor;
		}
		let res = await fetch(url, opts);
		json = await res.json();
		if(res.status == 401) {
			this.logOAuthURL();
			return false;
		}
		list = list.concat(json.data);
		cursor = json.pagination?.cursor;
	}while(cursor != null);

	for (let i = 0; i < list.length; i++) {
		const e = list[i];
		//Cleaning up only callbacks containing "ngrok". Change that if not using ngrok.
		//You may want to simply disable this condition.
		if(e.transport.callback.indexOf("ngrok") > -1) {
			console.log(LogStyle.FgCyan+"Cleaning up previous EventSub",e.id,LogStyle.Reset);
			let opts = {
				method:"DELETE",
				headers:{
					"Client-ID": TWITCH_CLIENT_ID,
					"Authorization": "Bearer "+twitchCredentialToken,
					"Content-Type": "application/json",
				}
			}
			fetch("https://api.twitch.tv/helix/eventsub/subscriptions?id="+e.id, opts).catch(error=>{
				console.log(LogStyle.FgRed+"EventSub Cleanup error for:", e.type, LogStyle.Reset)
			})
		}
	}
	return true;
}

/**
 * Subscribes to a spcific event
 */
async function subToType(type) {
	let condition = {
		"broadcaster_user_id": TWITCH_BROADCASTER_ID
	};

	if(type=="channel.raid") {
		condition = {
			"to_broadcaster_user_id":TWITCH_BROADCASTER_ID,
		}
	}
	let opts = {
		method:"POST",
		headers:{
			"Client-ID": TWITCH_CLIENT_ID,
			"Authorization": "Bearer "+twitchCredentialToken,
			"Content-Type": "application/json",
		},
		body:JSON.stringify({
			"type": type,
			"version": "1",
			"condition": condition,
			"transport": {
				"method": "webhook",
				"callback": webhookUrl+"/api/eventsubcallback",
				"secret": TWITCH_EVENTSUB_SECRET,
			}
		})
	}
	
	try {
		let res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", opts);
		if(res.status == 403) {
			logOAuthURL();
		}
	}catch(error) {
		console.error(LogStyle.FgRed+"EventSub subscription error for event:", type, LogStyle.Reset);
		//Try again
		setTimeout(_=> {
			subToType(type);
		}, 250)
		// console.log(error);
	}
}

/**
 * Logs the authorization URL on console
 */
function logOAuthURL() {
	console.log(LogStyle.FgRed+"Authorization must be granted to the Twitch app !"+LogStyle.Reset);
	console.log(LogStyle.FgRed+"Open this URL on your browser:"+LogStyle.Reset);
	console.log(LogStyle.BgRed+"https://id.twitch.tv/oauth2/authorize?client_id="+TWITCH_CLIENT_ID+"&redirect_uri=http%3A%2F%2Flocalhost%3A"+SERVER_PORT+"%2Foauth&response_type=token&scope="+TWITCH_SCOPES+LogStyle.Reset);
}


class LogStyle {
	static Reset = "\x1b[0m";
	static Bright = "\x1b[1m";
	static Dim = "\x1b[2m";
	static Underscore = "\x1b[4m";
	static Blink = "\x1b[5m";
	static Reverse = "\x1b[7m";
	static Hidden = "\x1b[8m";

	static FgBlack = "\x1b[30m";
	static FgRed = "\x1b[31m";
	static FgGreen = "\x1b[32m";
	static FgYellow = "\x1b[33m";
	static FgCyan = "\x1b[34m";
	static FgMagenta = "\x1b[35m";
	static FgCyan = "\x1b[36m";
	static FgWhite = "\x1b[37m";

	static BgBlack = "\x1b[40m";
	static BgRed = "\x1b[41m";
	static BgGreen = "\x1b[42m";
	static BgYellow = "\x1b[43m";
	static BgBlue = "\x1b[44m";
	static BgMagenta = "\x1b[45m";
	static BgCyan = "\x1b[46m";
	static BgWhite = "\x1b[47m";
}
