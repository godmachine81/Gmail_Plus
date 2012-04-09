//https://accounts.google.com/AddSession	
//https://accounts.google.com/b/0/MultipleSessions
/*
 * 	"content_scripts": [ {
		"all_frames": true,
	  	"js": [ "src/jquery.min.js", "src/content_scripts.js" ],
	  	"matches": [ "*://*.google.com/mail/*" ]
	}],
 */	
var localeMessages;
var email;
var itemID = "GmailChecker";
var img_notLoggedInSrc = "not_logged_in";
var iconSet = "set1";
var iconFormat = ".png";
var accounts = new Array();
var pollingAccounts = false;

var unreadCount;
var accountWithNewestMail;
var lastShowNotificationDates = new Array();

var canvas;
var canvasContext;
var gfx;
var rotation = 1;
var factor = 1;
var animTimer;
var loopTimer;
var animDelay = 10;

var notificationAudio = new Audio();

var oAuthForDevices;

var subjects = new Array();
var notification;
var idleStateWhenShowingNotification = "active";
var unreadCountWhenShowNotificationWhileActive;
var lastPollAccounts = new Date(1);

// init objects once in this background page and read them from all other views (html/popup/notification pages etc.)
ChromeTTS();
Tools();
Payments();

function getSettings() {
   return Settings;
}

$(document).ready(function() {
	init();
});

function startAnimate() {
	if (Settings.read("animateButtonIcon") === true) {
		gfx.src = "img/icons/" + iconSet + "/new" + iconFormat;
		stopAnimateLoop();
		animTimer = setInterval("doAnimate()", animDelay);
		setTimeout("stopAnimate()", 2000);
		loopTimer = setTimeout("startAnimate()", 20000);
	}
}

function stopAnimate() {
   if (animTimer != null) {
      clearTimeout(animTimer);
   }      
   setIcon(currentIcon);
   rotation = 1;
   factor = 1;
}

function stopAnimateLoop() {
   if (loopTimer != null) {
      clearTimeout(loopTimer);
   }
   stopAnimate();
}

function doAnimate() {
   canvasContext.save();
   canvasContext.clearRect(0, 0, canvas.width, canvas.height);
   canvasContext.translate(Math.ceil(canvas.width / 2), Math.ceil(canvas.height / 2));
   canvasContext.rotate(rotation * 2 * Math.PI);
   canvasContext.drawImage(gfx, -Math.ceil(canvas.width / 2), -Math.ceil(canvas.height / 2));
   canvasContext.restore();

   rotation += 0.01 * factor;

   if (rotation <= 0.9 && factor < 0)
      factor = 1;
   else if (rotation >= 1.1 && factor > 0)
      factor = -1;

   chrome.browserAction.setIcon({
      imageData: canvasContext.getImageData(0, 0, canvas.width, canvas.height)
   });
}

function showNotification(params) {
	if (Settings.read("desktopNotification")) {
		// not notification handle
		if (notification) {
			//var notifications = chrome.extension.getViews({type:"notification"});
			//if (notifications && notifications.length >=1) {
				chrome.extension.sendRequest({name:"addNewNotifications"}, function(response) {
					
				});
			//}
		} else {
			chrome.idle.queryState(120, function(newState) {
				console.log("idlestatewhen show notifc: " + newState);
				idleStateWhenShowingNotification = newState;
				if (newState == "active") {
					unreadCountWhenShowNotificationWhileActive = unreadCount;
				}
			});
	
			var notificationURL;
			if (pref("notificationWindowType") == "advanced" || (params && params.showAdvancedNotification)) {
				notificationURL = "popup.html?notificationWindow=true";
			} else {
				notificationURL = "notify.html";
			}
			
			notification = webkitNotifications.createHTMLNotification(chrome.extension.getURL(notificationURL));
			notification.onclose = function() {
				console.log("onclose notification");
				notification = null;
			}
			notification.show();
		}
	}
}

function showTemplateNotification(title, message, callback) {
   localStorage.templateTitle = title;
   localStorage.templateText = message;
   window.templateCallback = callback;

   var notification = webkitNotifications.createHTMLNotification(chrome.extension.getURL("template.html"));
   notification.onclose = function () {
      delete localStorage.templateTitle;
      delete localStorage.templateText;
      window.templateCallback = null;
   };
   notification.show();
}

function init() {

	try {
		if (!localStorage.detectedChromeVersion) {
			localStorage.detectedChromeVersion = true;
			Tools.detectChromeVersion(function(result) {
				if (result && result.channel == "null") {
			         showTemplateNotification("Reminder: You are not using the stable channel of Chrome", "You can use this extension, however, bugs might occur. For obvious reasons, these bugs and reviews will be ignored unless you can replicate them on stable channel of Chrome. <a href='#' style='white-space:nowrap'>More info</a>...", function () {
			            chrome.tabs.create({ url: "http://google.com/wiki/Unstable_channel_of_Chrome" });
			         });
				}
			});
		}
	} catch (e) {
		console.error("error detecting chrome version: " + e);
	}
	
	canvas = document.getElementById('canvas');
	canvasContext = canvas.getContext('2d');
	gfx = document.getElementById('gfx');

	//setIcon(img_notLoggedInSrc);
	chrome.browserAction.setBadgeBackgroundColor({ color: [190, 190, 190, 255] });
	chrome.browserAction.setBadgeText({ text: "..." });
	chrome.browserAction.setTitle({ title: getMessage("loadingSettings") + "..." });

	Settings.load(function () {
		
		var lang = pref("language", window.navigator.language);
		loadLocaleMessages(lang, function() {			
			initCommon();			
			unreadCount = 0;

			iconSet = Settings.read("icon_set");
			setIcon(img_notLoggedInSrc);			
			
			// LEGACY code when migrating to multiple oauth for contacts			
			var tokenResponse = Settings.read("tokenResponse") // singular (no 's') here
			if (tokenResponse) {
				var contacts = Settings.read("contacts");
				if (contacts && contacts.length >= 1) {
					try {
						var userEmail = contacts[0].id.$t;
						userEmail = userEmail.match(/contacts\/(.*)\/base/);
						userEmail = unescape(userEmail[1]);
						tokenResponse.userEmail = userEmail;
						var tk = new Array(tokenResponse);
					} catch (e) {
						console.error("problem with legacy code: " + e);
					}
					console.log("legacy code");
					
					// delete old stuff
					Settings.store("tokenResponse");
					Settings.store("contacts");
					
					// add new
					Settings.store("tokenResponses", tk);
				}			
			}
			
			if (Settings.read("sn_audio") == "chime.mp3") {
				Settings.store("sn_audio", "chime.ogg");
			}

			// patch for saving new Date() objects from locales such as german which have umlates creates indexedb corruption refer to Martin Stamm
			var tokenResponsesFromIndexedDB = Settings.read("tokenResponses");
			if (tokenResponsesFromIndexedDB) {
				// copy them to localstorage
				localStorage["tokenResponses"] = JSON.stringify(tokenResponsesFromIndexedDB);
				
				// remove them
				Settings.store("tokenResponses");
			}
			
			// END LAGACY
				
			var tokenResponses = localStorage["tokenResponses"];
			if (tokenResponses) {
				
				function replacer(key, value) {
				    if (key == "expiryDate") {		
				        return new Date(value);
				    } else {
				    	return value;
				    }
				}
				
				tokenResponses = JSON.parse(tokenResponses, replacer);
				console.log("tk: ", tokenResponses);
			}
			
			oAuthForDevices = new OAuthForDevices(tokenResponses);
			oAuthForDevices.setOnTokenChange(function(params, allTokens) {
				if (params.tokenResponse) {
					//Settings.store("tokenResponses", allTokens);
					localStorage["tokenResponses"] = JSON.stringify(allTokens);
				} else {
					//alert("Error getting access token: " + params.error);
				}
			});
			
			initPopup(unreadCount);
			// Add listener once only here and it will only activate when browser action for popup = ""
			chrome.browserAction.onClicked.addListener(function(tab) {
				openInbox(0);
			});

			chrome.extension.onRequest.addListener(function (request, sender, sendResponse) {
				if (request.command == "getURL" && accounts != null && accounts.length > 0) {
					sendResponse({ URL: accounts[0].getURL(), openTab: Settings.read("open_tabs") });
				} else if (request.command == "openTab") {
					chrome.tabs.create({url:request.url});
				}
			});
				    
			chrome.extension.onRequestExternal.addListener(function(request, sender, sendResponse) {
				if (sender.id == "blacklistedExtension") {
					//sendResponse({});  // don't allow this extension access
				} else {
					sendResponse({installed:true});
				}
			});
			
			chrome.idle.onStateChanged.addListener(function(newState) {
				// returned from idle state
				console.log("onstatechange: " + newState + " " + now().toString());
				if (newState == "active") {
					console.log("unreadacount: " + unreadCount + " while active it was: " + unreadCountWhenShowNotificationWhileActive);
					if (unreadCount != 0 && unreadCount > unreadCountWhenShowNotificationWhileActive) {
						chrome.windows.getLastFocused(function(window) {
							if (window.focused) {
								console.log("window is focused");
								// url: must be URL pattern like in manifest ex. http://abc.com/* (star is almost mandatory)
								// if gmail NOT already focused then show notification
								chrome.tabs.query({windowId:window.id, 'active': true, url:accountWithNewestMail.getURL() + "*"}, function(tabs) {
									console.log("active tab is the gmail account?: " + tabs);
									if (!tabs) {
										showNotification();
									}
								});
							} else {
								showNotification();
							}
						});
					}
				}
			});
			
			// for adding mailto links (note: onUpdated loads twice once with status "loading" and then "complete"
			chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
				if (changeInfo.status == "loading") {
					
					var alreadyDetectedInbox = false;
					if (accounts) {
					    $.each(accounts, function (i, account) {
							if (tab.url.indexOf(account.getURL()) == 0 || tab.url.indexOf(account.getURL().replace("http:", "https:")) == 0 || tab.url.indexOf(account.getURL().replace("https:", "http:")) == 0) {
								console.log("saw gmail! updating: " + tab.url);
								account.getEmails();
								alreadyDetectedInbox = true;
								return false;
							}
					    })
					}
					
					
					if (tab.url.indexOf("https://mail.google.com/mail/") == 0) {
						localStorage["lastCheckedEmail"] = now().toString();
					}
					
					if (tab.url.indexOf("https://mail.google.com/mail/") == 0 && !alreadyDetectedInbox) {
						console.log("newly signed in")
						pollAccounts();
					}
					
					/*
					 	order of urls when logging out of gmail...
					 	
					  	https://mail.google.com/mail/u/0/?logout&hl=en&loia
						https://accounts.google.com/Logout?service=mail&continue=http://www.google.com/mail/help/intl/en/logout.html%23hl%3Den&hl=en
						https://accounts.youtube.com/accounts/Logout2?hl=en&service=mail&ilo=1&ils=s.youtube&ilc=0&continue=http%3A%2F%2Fwww.google.com%2Fmail%2Fhelp%2Fintl%2Fen%2Flogout.html%23hl%3Den&zx=640039438
						https://accounts.youtube.com/accounts/ClearSID?zx=593429634
						http://www.google.com/mail/help/intl/en/logout.html#hl=en
					 */
					if (tab.url.indexOf("://www.google.com/accounts/Logout") != -1) {
						accounts = new Array();
						setSignedOut();
					}

					//console.log("loading: " + tab.url);

					chrome.permissions.contains({origins: [getMessage("origins_mailtoLinks")]}, function(result) {
						// cannot call executeScript on extensions gallery pages: https://chrome.google.com/webstore
						
						// when "reloading" a page that was "already" an error page from being offline the title happens to contain blahblah is not available, so parse for and don't execute the script on it
						var available = true;
						if (tab.title && tab.title.indexOf("is not available") != -1) {
							available = false;
						}
						//console.log(tab.title + " tab: ", tab)
						if (result && available && tab.url.indexOf("http") == 0 && tab.url.indexOf("https://chrome.google.com/webstore") == -1 && tab.url.indexOf("chrome://chromewebdata/") == -1) { // make sure it's standard webpage and not extensions:// or ftp:// because errors are generated
							chrome.tabs.executeScript(tabId, {file:"src/mailto.js", allFrames:true});
						}
					});					
					
				} else if (changeInfo.status == "complete") {

					//console.log("complete: " + tab.url);

					var code = tab.title.match(/success code=(.*)/i);
					if (code && code.length != 0) {
						code = code[1];
						chrome.tabs.remove(tabId);
						
						oAuthForDevices.getAccessToken(code, function(params) {
							if (params.tokenResponse) {								
								// add
								console.log("add contacts");
								fetchContacts(params.tokenResponse.userEmail, function(params) {
									if (params.contactDataItem) {
										var contactsData = Settings.read("contactsData");
										if (!contactsData) {
											contactsData = new Array();
										}
										var foundContactsDataItem = false;
										for (var a=0; a<contactsData.length; a++) {
											if (contactsData[a] && contactsData[a].userEmail == params.contactDataItem.userEmail) {
												foundContactsDataItem = true;
												console.log('found: updating existing contactsDataItem')
												contactsData[a] = params.contactDataItem;
												break;
											}
										}
										if (!foundContactsDataItem) {
											console.log("creating new contactsDataItem");
											contactsData.push(params.contactDataItem);
										}
										console.log("contactdata: ", contactsData);
										Settings.store("contactsData", contactsData);
										chrome.extension.sendRequest({command: "grantPermissionToContacts", contactDataItem:params.contactDataItem}); 
									} else {
										alert(params.error);
										console.error(params.error);
									}
								});
							} else {
								if (params.warning) {
									// ignore: might by re-trying to fetch the userEmail for the non default account									
								} else {
									alert("Error getting access token: " + params.error);
								}
							}
						});
					}
				}				
			});
			
			chrome.tabs.onActiveChanged.addListener(function(tabId, selectInfo) {
				chrome.tabs.get(tabId, function(tab) {
					if (tab) {
						if (tab.url.indexOf("https://mail.google.com") != -1) {
							if (notification) {
								notification.cancel();
							}
						}
					}
				});
			});

			Tools.getManifest(function(manifest) {
				if (!Settings.read("installDate")) {
					// patch for chrashing Chrome dev: if you add a Date object to the indexeddb it crashes
					Settings.store("installDate", new Date().toString());
					Settings.store("installVersion", manifest.version);
				}

				var previousVersion = Settings.read("version");
				if (previousVersion != manifest.version) {
					Settings.store("version", manifest.version);

					if (previousVersion) { // old user
						var NOTIFY_ABOUT_MAILTO = "notifyAboutMailto";
						if (!localStorage[NOTIFY_ABOUT_MAILTO]) {
							localStorage[NOTIFY_ABOUT_MAILTO] = new Date();
							/*
					         showTemplateNotification("Update to Checker Plus for Gmail", "Good news! I've lowered the default permissions of this extension to make it safer! This has disabled the mailto option which required the permissions, if you'd like to re-enable it then click here to go into the options under general.", function () {
					            chrome.tabs.create({ url: "options.html" });
					         });
							 */
						}
					} else { // first time user						
						chrome.tabs.create({url: "options.html?install=true"});
					}
				}
			});
			
			// call poll accounts initially then set it as interval
			pollAccounts({showNotification:true}, function() {
				// set check email interval here
				setInterval(function() {
					getAllEmails(accounts, function(allEmailsCallbackParams) {
						mailUpdate({showNotification:true, allEmailsCallbackParams:allEmailsCallbackParams});
					});
					
				}, Settings.read("poll"));
			});
			
			setInterval(function() {
				// every 10 minutes or if not signed in to any accounts
				
				var errorWithAnAccount = false;
				/*
				$.each(accounts, function(i, account) {
					if (account.status != "success") {
						console.log("error with an account: " + account.id);
						errorWithAnAccount = true;
						return false;
					}
				});
				*/

				if (accounts.length == 0 || errorWithAnAccount) { //|| lastPollAccounts.diffInMinutes() <= -10
					pollAccounts({showNotification:true});
				}
			}, 10 * ONE_SECOND);
		});

		/*
		$(window).on("beforeunload", function() {
			 return "abcddd";
		});
		*/
		
	});
}

function initMailAccount(accountNumber, callback) {
	var MAX_ACCOUNTS = 50;
	
    stopAnimateLoop();        
    
    var account = new MailAccount({ accountNr: accountNumber });
    
    account.getEmails(null, function(cbParams) {
    	
    	// maximum accounts, if over this we might be offline and just gettings errors for each account
    	if (accountNumber <= MAX_ACCOUNTS && navigator.onLine) {
    		if (cbParams.ignored) {
    			// do not add, ignore this one and try next
    			
    		//} else if (cbParams.error && (accountNumber == 0 || accounts.length == 0 || (cbParams.jqXHR.status == 401 || cbParams.error.toLowerCase() == "unauthorized"))) { // not signed in
    		} else if (cbParams.error && (cbParams.jqXHR.status == 401 || cbParams.error.toLowerCase() == "unauthorized")) { // not signed in
    			// if offline then watch out because all accounts will return error, but not unauthorized, so must stop from looping too far
    			account = null;
    			delete account;
    			callback();
    			return;
    		} else {
    			accounts.push(account);
    		}
    		initMailAccount(accountNumber+1, callback);
    	} else {
    		if (cbParams.error) {
    			// Error on last one most probably they were all errors ie. timeouts or no internet so reset all accounts to 0
    			accounts = new Array();    			
    		} else {
    			console.error("jmax accounts reached");    			
    		}
    		callback();
    		return;
    	}
    });
}

function pollAccounts(params, cb) {
	var callback;
	if (cb) {
		callback = cb;
	} else {
		// params might be the callback (if no 2nd parameter passed)
		if ($.isFunction(params)) {
			callback = params;
			params = null;
		} else {
			callback = function() {};
		}
	}

	if (pollingAccounts) {
		console.log("currently polling; quit polling me!")
		callback();
		return;
	}
	lastPollAccounts = now();	
	pollingAccounts = true;
	
	chrome.browserAction.setBadgeText({ text: "..." });
	chrome.browserAction.setTitle({ title: getMessage("pollingAccounts") + "..." });

	console.log("poll accounts...");
	if (accounts != null) {
		$.each(accounts, function (i, account) {
			account = null;
			delete account;
		});
	}
	
	accounts = new Array();
	
	initMailAccount(0, function() {
		var signedIntoAccounts = 0;		
		$.each(accounts, function(i, account) {
			if (!account.error) {
				signedIntoAccounts++;
			}
		});
		
		if (signedIntoAccounts == 0) {
			setSignedOut();
		} else {
			// save default email for payment stuff
			email = accounts.first().getAddress();
			
			// temp code to be removed in a couple of weeks
			//localStorage["verifyPaymentRequestSent"] = true;
			
			// see if i should unlock this user...
			if (!localStorage["verifyPaymentRequestSent"]) {
				//alert("test")
				//email = "yoyo8@nodomain.com";
				
				var emails = new Array();
				$.each(accounts, function(i, account) {
					emails.push(account.getAddress());
				});

				Payments.verifyPayment(itemID, emails, function(response) {
					console.log("emails", emails);
					if (response && response.unlocked) {
						Payments.processFeatures();
					}
				});
				localStorage["verifyPaymentRequestSent"] = true;
			}
			
			mailUpdate(params);				
		}
		callback();
		unreadCountWhenShowNotificationWhileActive = unreadCount;
		pollingAccounts = false;
	});
}

var currentIcon;
function setIcon(iconName) {
	currentIcon = iconName;
	var iconPath = "img/icons/" + iconSet + "/" + iconName + iconFormat;
	chrome.browserAction.setIcon({ path: iconPath });
}

// Called when an account has received a mail update
function mailUpdate(params) {
	stopAnimateLoop();   

	var totalUnread = 0;
	var lastMailUpdateAccountWithNewestMail;
	$.each(accounts, function(i, account) {

		if (!account.error) {
			if (account.getUnreadCount() > 0) {
				totalUnread += account.getUnreadCount();
			}
		}

		if (account.getNewestMail()) {
			if (!lastMailUpdateAccountWithNewestMail || !lastMailUpdateAccountWithNewestMail.getNewestMail() || account.getNewestMail().issued > lastMailUpdateAccountWithNewestMail.getNewestMail().issued) {
				lastMailUpdateAccountWithNewestMail = account;
			}
		}
	});
	
	updateBadge(totalUnread);
	
	if (lastMailUpdateAccountWithNewestMail && lastMailUpdateAccountWithNewestMail.getNewestMail()) {
		accountWithNewestMail = lastMailUpdateAccountWithNewestMail;

		var passedDateCheck = false;
		if (Settings.read("showNotificationsForOlderDateEmails")) {
			if (accountWithNewestMail.getMail().length < 20) {
				passedDateCheck = true;
			} else {
				console.warn("more than 20 emails so bypassing check for older dated emails");
				if (accountWithNewestMail.getNewestMail().issued > lastShowNotificationDates[accountWithNewestMail.id]) {
					passedDateCheck = true;
				}
			}
		} else {
			if (accountWithNewestMail.getNewestMail().issued > lastShowNotificationDates[accountWithNewestMail.id]) {
				passedDateCheck = true;
			}
		}
		
		if (!lastShowNotificationDates[accountWithNewestMail.id] || passedDateCheck) {
			lastShowNotificationDates[accountWithNewestMail.id] = accountWithNewestMail.getNewestMail().issued;

			var mailIdHash = $.md5(accountWithNewestMail.getNewestMail().id);
			var addressHash = $.md5(accountWithNewestMail.getAddress());
	
			if (mailIdHash != localStorage[addressHash + "_newest"]) {
				
				if (Settings.read("soundNotification")) {
					playNotificationSound();    		  
				}			
				
				startAnimate();				

				if (params && params.showNotification) { 
					showNotification();
					playVoiceNotification(accountWithNewestMail);
				}
				
				localStorage[addressHash + "_newest"] = mailIdHash;
			}
		}
	}
	
	unreadCount = totalUnread;
	initPopup(unreadCount);

}

function setSignedOut() {
	setIcon(img_notLoggedInSrc);
	chrome.browserAction.setBadgeBackgroundColor({ color: [190, 190, 190, 255] });
	chrome.browserAction.setBadgeText({ text: "X" });
	chrome.browserAction.setTitle({ title: getMessage("notSignedIn") });
	unreadCount = 0;
	email = null;
}

// Plays a ping sound
function playNotificationSound() {
   var source = Settings.read("sn_audio");

   if (source == "custom") {
      source = Settings.read("sn_audio_raw");
   }

   try {
	   //notificationAudio.pause();
	   // patch for ogg might be crashing extension
	   // patch linux refer to mykhi@mykhi.org
	   if (navigator.platform.toLowerCase().indexOf("linux") != -1 || !notificationAudio.src || notificationAudio.src.indexOf(source) == -1) {
		  notificationAudio.src = source;
	   } 
	  //notificationAudio.load();
	  notificationAudio.volume = pref("notificationSoundVolume") / 100;
	  notificationAudio.play();
   } catch (e) {
      console.error(e);
   }
}

function detectLanguage(text, callback) {
	chrome.permissions.contains({origins: [getMessage("origins_languageDetection")]}, function(result) {
		if (result) {
			$.ajax({
				type: "GET",
				url: "http://ws.detectlanguage.com/0.2/detect",
				data: {q: text, key:"b60a07acb3ed2701668c3b5d37d8f96c"},
				dataType: "json",
				timeout: 2000,
				complete: function(request, textStatus) {
					var status = getStatus(request, textStatus);
					if (status == 200) {
						var data;
						try {
							data = JSON.parse(request.responseText);
						} catch (e) {
							console.error("could not parse detect lang response: " + request.responseText);
							callback();
							return;
						}
						if (data && data.data && data.data.detections && data.data.detections.length != 0) {
							lang = data.data.detections[0].language;
							console.log("lang detected: " + lang)
							if (lang == "eu" || lang == "et" || lang == "sq") { // estonia
								lang = "en";
							}
						}
						callback({lang:lang});
					} else {
						console.error("error with detect: " + status + " " + textStatus)
						callback();
					}
				}
			});
		} else {
			callback();
		}
	});
}

function playVoiceNotification(accountWithNewestMail) {	
	if (Settings.read("voiceNotification")) {
		var newestEmail = accountWithNewestMail.getNewestMail();

		var fromName = newestEmail.authorName;
		fromName = fromName.split(" ")[0];

		var subject = newestEmail.title;
		subject = subject.replace(/^re: ?/i, "");
		subject = subject.replace(/^fwd: ?/i, "");

		var introToSay = "";
		var introToSayEnglish = "";
		var messageToSay = "";

		if (pref("hearSubject") || pref("hearMessage")) {
			
			introToSay = getMessage("NAME_says", fromName);
			introToSayEnglish = fromName + " says";
			
			if (pref("hearSubject") && !subjects[subject] && !subject.match(/no subject/i) && !subject.match(/sent you a message/i)) {
				subjects[subject] = "ALREADY_SAID";
				messageToSay += subject;
			} else {
				console.log("omit saying the subject line")
			}
			console.log("message to say: " + subject)
			
			if (pref("hearMessage")) {
				// if 'from:' found ignore thereon
				// ex. Yes and yes... From: hamishw55@hotmail.com To: d_sinnig@encs.concor
				// blah blah Original Message
				var threadText = newestEmail.getLastThreadText();
				threadText = threadText.replace("&#39;", "'");
				
				var spokenWordsLimit = Settings.read("spokenWordsLimit");
				var spokenWordsLimitLength;
				if (spokenWordsLimit == "summary") {
					spokenWordsLimitLength = 101;
				} else if (spokenWordsLimit == "paragraph") {
					spokenWordsLimitLength = 500;
				} else {
					spokenWordsLimitLength = 30000;
				}
				threadText = threadText.summarize(spokenWordsLimitLength);
				/*
				// take only the first 8 words...
				var MAX_WORDS = 24;
				var bodyWords = body.split(" ", MAX_WORDS);
				body = bodyWords.join(" ");
				*/
				
				messageToSay += ", " + threadText;
			}
		} else {
			introToSay = getMessage("emailFrom_NAME", fromName);
			introToSayEnglish = "Email from " + fromName;
		}

		chrome.idle.queryState(parseInt(pref("voiceNotificationOnlyIfIdleInterval")), function(state) {
			// apparently it's state can be locked or idle
			if (!pref("voiceNotificationOnlyIfIdle") || (pref("voiceNotificationOnlyIfIdle") && state != "active")) {
				// put a bit of time between chime and voice
				setTimeout(function() {
					console.log("message to say : " + introToSay + " " + messageToSay);					
					if (pref("voice").indexOf("Multilingual TTS Engine") != -1) {
						if (navigator.onLine) {
							// must you .off or .on's will queue
							var lang = pref("language", window.navigator.language);
							
							detectLanguage(messageToSay, function(detectLanguageResult) {
								// if intro and message are same lang then play them in one submit to google
								if (!detectLanguageResult || lang == detectLanguageResult.lang) {
									ChromeTTS.queue(introToSay + ", " + messageToSay);
								} else {
									ChromeTTS.queue(introToSay);
									ChromeTTS.queue(messageToSay);
								}
							});
							
							
							/*
							// Must call detect language before trying to speak anything because there's a lag so don't want the intro and message to be far apart
							detectLanguage(messageToSay, function(detectLanguageResult) {
								
								// if intro and message are same lang then play them in one submit to google
								if (!detectLanguageResult || lang == detectLanguageResult.lang) {
									playVoice({voiceObj:voice, lang:lang, msg:introToSay + ", " + messageToSay, onErrorPlayChromeTTSMessage: introToSayEnglish + ", " + messageToSay});
								} else {
									console.log("play intro")
									playVoice({voiceObj:voice, lang:lang, msg:introToSay, onErrorPlayChromeTTSMessage:introToSayEnglish}, function() {
										// success										
										if (detectLanguageResult.lang) {
											lang = detectLanguageResult.lang;
										}
										console.log("play message")
										var playVoiceParams = {voiceObj:voice, lang:lang, msg:messageToSay};
										// only play chrome tts if message is in english
										if (!lang || lang.indexOf("en") != -1) {
											playVoiceParams.onErrorPlayChromeTTSMessage = messageToSay;
										}
										playVoice(playVoiceParams);										
									});
								}
							});
							*/
						} else {
							ChromeTTS.queue(introToSayEnglish + ", " + messageToSay, {voiceName:"native"});
						}
					} else {
						ChromeTTS.queue(introToSayEnglish + ", " + messageToSay);
					}
				}, 500);
			}
		});
	}
}
