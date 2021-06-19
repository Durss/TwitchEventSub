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
//Twitch scopes to request
const TWITCH_SCOPES = "channel:read:subscriptions+bits:read+channel:manage:redemptions+channel:manage:predictions+channel:manage:polls";
//Client ID of a twitch APP
const TWITCH_CLIENT_ID = "";
//Secret ID of a twitch APP
const TWITCH_CLIENT_SECRET = "";
//Key used to generate a validation hash. Write anything you want!
const TWITCH_EVENTSUB_SECRET = "";
const EVENTS_TO_SUB_TO = [
							"channel.follow",
							// "channel.channel_points_custom_reward_redemption.add",
							// "channel.poll.begin",
							// "channel.poll.progress",
							// "channel.poll.end",
							// "channel.prediction.begin",
							// "channel.prediction.progress",
							// "channel.prediction.lock",
							// "channel.prediction.end"
						];


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
		return;
	}
	
	if(json.subscription.status == "webhook_callback_verification_pending") {
		//Challenging signature
		let sig = req.headers["twitch-eventsub-message-signature"];
		let ts = req.headers["twitch-eventsub-message-timestamp"];
		let hash = "sha256="+HmacSHA256(id+ts+JSON.stringify(req.body), TWITCH_EVENTSUB_SECRET).toString();
		if(hash != sig) {
			console.error("Invalid signature challenge")
			res.status(401);
			return;
		}
		console.log("EventSub challenge completed for "+json.subscription.type)
		res.status(200).send(req.body.challenge);

	}else{
		console.log("New EventSub : "+json.subscription.type);

		let data = req.body.event;//Contains event's data
		console.log(data);
	}
});

//Crate server
app.listen(SERVER_PORT, () => {
    console.log('Server is up on PORT '+SERVER_PORT);
	connect();
})

async function connect() {
	webhookUrl = await ngrok.connect({authtoken: NGROK_AUTH_TOKEN, addr:SERVER_PORT, proto:"http"});

	//Authenticated
	await createTwitchClientCredentialToken();

	//Unsubs previous webhooks created by the twitch app
	await unsubPrevious();

	//Subscribes to events with the newly created webhook URL
	for (let i = 0; i < EVENTS_TO_SUB_TO.length; i++) {
		await subToType(EVENTS_TO_SUB_TO[i]);
		
	}
}

/**
 * Creates a credential token
 * 
 * @returns 
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
				console.error("TOKEN creation failed");
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
 * 
 * @returns 
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
	let res = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", opts);
	let json = await res.json();
	if(res.status == 401) {
		this.logOAuthURL();
		return;
	}
	for (let i = 0; i < json.data.length; i++) {
		const e = json.data[i];
		console.log("Cleanup prev EventSub",e.id);
		if(e.transport.callback.indexOf("ngrok") > -1) {
			let opts = {
				method:"DELETE",
				headers:{
					"Client-ID": TWITCH_CLIENT_ID,
					"Authorization": "Bearer "+twitchCredentialToken,
					"Content-Type": "application/json",
				}
			}
			fetch("https://api.twitch.tv/helix/eventsub/subscriptions?id="+e.id, opts).catch(error=>{
				console.error("EventSub Cleanup error for:", e.type)
			})
		}
	}
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
			this.logOAuthURL();
		}
	}catch(error) {
		console.error("EventSub subscription error for event:", type);
		//Try again
		setTimeout(_=> {
			subToType(type);
		}, 250)
		// console.log(error);
	}
}

function logOAuthURL() {
	console.error("Authorization must be granted to the Twitch app !");
	console.error("Open this URL on the browser");
	console.log(LogStyle.BgRed+"https://id.twitch.tv/oauth2/authorize?client_id="+TWITCH_CLIENT_ID+"&redirect_uri=http%3A%2F%2Flocalhost%3A"+SERVER_PORT+"%2Foauth&response_type=token&scope="+TWITCH_SCOPES+LogStyle.Reset);
}