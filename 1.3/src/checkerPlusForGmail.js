function getAllEmails(accounts, callback) {
	var getEmailsCallbackParams = new Array();
	var deferreds = new Array();
	$.each(accounts, function (i, account) {
		var deferred = account.getEmails(null, function(params) {
			getEmailsCallbackParams.push(params);
		});
		deferreds.push(deferred);
	});
	$.when.apply($, deferreds).always(function() {		
		callback(getEmailsCallbackParams);
	});
}

function updateBadge(totalUnread) {
	var bg;
	if (window.bg) {
		bg = window.bg;
	} else {
		bg = window;
	}
	
	var img_noNewSrc = "no_new";
	var img_newSrc = "new";

	var accounts = bg.accounts;
	var atleastOneSuccessfullAccount = false;
	$.each(accounts, function(i, account) {
		if (!account.error) {
			atleastOneSuccessfullAccount = true;
			return false;
		}
		return true;
	});
	
	if (!atleastOneSuccessfullAccount) {
		bg.setIcon(bg.img_notLoggedInSrc);		
	} else if (accounts && accounts.length >= 1) {
		var hideCount = Settings.read("hide_count");
		if (hideCount || totalUnread < 1) {
			chrome.browserAction.setBadgeText({ text: "" });
		} else {
			chrome.browserAction.setBadgeText({ text: totalUnread.toString() });
		}
	
		switch (totalUnread) {
		case 0:
			bg.setIcon(img_noNewSrc);
			chrome.browserAction.setBadgeBackgroundColor({ color: [110, 140, 180, 255] });
			chrome.browserAction.setTitle({ title: getMessage('noUnreadText') });
			break;
		case 1:
			bg.setIcon(img_newSrc);
			chrome.browserAction.setBadgeBackgroundColor({ color: [200, 100, 100, 255] });
			chrome.browserAction.setTitle({ title: totalUnread + " " + ((getMessage('oneUnreadText')) ? getMessage('oneUnreadText') : getMessage('severalUnreadText')) });
			break;
		default:
			bg.setIcon(img_newSrc);
			chrome.browserAction.setBadgeBackgroundColor({ color: [200, 100, 100, 255] });
			chrome.browserAction.setTitle({ title: totalUnread + " " + getMessage('severalUnreadText') });
			break;
		}
	}
}

function initPopup(unreadCount) {
	var previewSetting = Settings.read("preview_setting");
	
	if (previewSetting == 0) {
		// Preview setting set to "Always off" =
		// Go to first mail inbox with unread items
		//openInbox(0);
		chrome.browserAction.setPopup({popup:""});
	} else if (previewSetting == 1 && unreadCount === 0) {
		// Preview setting set to "Automatic" + no unread mail =
		// Go to first mail inbox
		//openInbox(0);
		chrome.browserAction.setPopup({popup:""});
	} else {
		chrome.browserAction.setPopup({popup:"popup.html"});
	}
}

function openInbox(accountId) {	
	var mailAccounts = chrome.extension.getBackgroundPage().accounts;
	if (accountId == null) {
		accountId = 0;
		// Open first inbox with unread items
		$.each(mailAccounts, function (i, account) {
			if (account.getUnreadCount() > 0) {
				accountId = account.id;
				return false;
			}
			return true;
		});
	}

	if(mailAccounts == null || mailAccounts[accountId] == null) {
		console.error("No mailaccount(s) found with account id " + accountId);
		return;
	}

	mailAccounts[accountId].openInbox();
	//window.close();
}

function fetchContacts(userEmail, callback) {
	var contactDataItem = {}
	contactDataItem.userEmail = userEmail;
	contactDataItem.lastFetch = now().toString();
	chrome.extension.getBackgroundPage().oAuthForDevices.send({userEmail:userEmail, url: "https://www.google.com/m8/feeds/contacts/" + userEmail + "/thin", data:{alt:"json", "max-results":"2000"}}, function(result) {
		if (result.data) {
			contactDataItem.contacts = result.data.feed.entry;			
			callback({contactDataItem:contactDataItem});
		} else {
			callback({error:"error getting contacts: " + result.error});
		}			
	});
}

function getContacts(account, callback) {
	var contactsData = Settings.read("contactsData");
	if (contactsData) {
		// maybe update
		for (var a=0; a<contactsData.length; a++) {
			if (contactsData[a] && contactsData[a].userEmail == account.getAddress()) {
				if (new Date(contactsData[a].lastFetch).diffInHours() > -parseInt(Settings.read("fetchContactsInterval"))) {
					//console.log("diffinhours: " + new Date(contactsData[a].lastFetch).diffInHours());
					console.log("contacts from cache: " + account.getAddress());
					callback({contacts:contactsData[a].contacts});
				} else {
					// update contacts
					console.log("updating contacts: " + account.getAddress());					
					fetchContacts(account.getAddress(), function(params) {
						if (params.contactDataItem) {
							contactsData[a] = params.contactDataItem;
							Settings.store("contactsData", contactsData);
							callback({contacts:params.contactDataItem.contacts});
						} else {
							callback(params);
						}
					});
				}
				return;
			}
		}
		console.log("not found")		
		callback({error:"Not found in cache"});
	} else {
		console.log("no contactsdata; might have not been given permission");
		callback({error:"No cache created yet for contactsData"});
	}
}

function getContact(params, callback) {
	var emailToFind;
	if (params.email) {
		emailToFind = params.email;
	} else {
		emailToFind = params.mail.authorMail;
	}	
	
	var found = false;
	getContacts(params.mail.account, function(params) {
		if (params.contacts) {
			$.each(params.contacts, function(index, contact) {
				if (contact.gd$email) {
					$.each(contact.gd$email, function(index, contactEmail) {
						if (contactEmail.address == emailToFind) {
							//console.log("found");
							found = true;
							callback(contact);
							return false;
						}
						return true;
					});
					if (found) {
						return false;
					}
				}
				return true;
			});
		}
		if (!found) {
			console.log("not found: " + emailToFind);
			callback();
		}
	});
}

function getContactPhoto(params, callback) {
	getContact(params, function(contact) {
		if (contact) {
			var url = contact.link[0].href;
			bg.oAuthForDevices.generateURL(params.mail.account.getAddress(), url, function(params) {
				params.contact = contact;
				callback(params);
			});
		} else {
			callback({});
		}
	});
}


function htmlToText(html) {
	var tmp = document.createElement("DIV");
	
	// replace br with space
	html = html.replace(/<br\s*[\/]?>/gi, " ");
	
	// replace <p> and </p> with spaces
	html = html.replace(/<\/?p\s*[\/]?>/gi, " ");
	
	// add a space before <div>
	html = html.replace(/<\/?div\s*[\/]?>/gi, " ");
	
	// this is usually the greyed out footer/signature in gmail emails, so remove it :)
	html = html.replace(/<font color=\"#888888\">.*<\/font>/gi, "");
	
	tmp.innerHTML = html;
	var str = tmp.textContent
	str = str.replace(/\n/g, " ");
	
	// remove 2+ consecutive spaces
	str = str.replace(/\s\s+/g, " ")
	return $.trim(str);
}

// parse a string ie. "Wed, Jan 25, 2012 at 1:53 PM"
// danish 10. mar. 2012 13.00
function parseGoogleDate(dateStr) {
	var d = new Date();

	var pieces = dateStr.match(/(\d\d?).*(\d\d\d\d)/);
	if (pieces) {
		var dateOfMonth = pieces[1];
		var year = pieces[2];
		d.setDate(dateOfMonth);
		
		// try to get month
		var monthFound = false;
		var pieces2 = dateStr.match(/([A-Z][a-z][a-z]) \d/);
		if (pieces2 && pieces2.length >= 2) {
			var shortMonthName = pieces2[1]; 
			var monthIndex = dateFormat.i18n.monthNamesShort.indexOf(shortMonthName);
			if (monthIndex != -1) {
				d.setMonth(monthIndex);
				monthFound = true;
			}
		}
		
		if (!monthFound) {
			// since couldn't detect the month str we assume it's this month but if the dateof the month is larger than today let's assume it's last month
			if (year == d.getFullYear() && dateOfMonth > d.getDate()) {
				d.setMonth(d.getMonth()-1);
			}
		}
		d.setFullYear(year);
		
		// now get the time
		var timeObj = dateStr.parseTime();
		if (timeObj) {		
			// merge date and time
			d.setHours(timeObj.getHours());
			d.setMinutes(timeObj.getMinutes());
			d.setSeconds(timeObj.getSeconds());
			return d;
		} else {
			// could not find time in str
			return null;
		}
	}	
	return null;
}

function initButtons(buttons) {
	if (!buttons) {
		buttons = Settings.read("buttons");
	}
	
	$("html").removeClass("buttonsoriginal");
	$("html").removeClass("buttonsgreen");
	$("html").removeClass("buttonsvoythas");
	$("html").removeClass("buttonsdark");
	
	$("html").addClass("buttons" + buttons);
}

function showHideButtons() {
	
	// show/hide buttons
	if (!Settings.read("showStar")) {
		$(".mail .star, .basicNotificationWindow .star").hide();
	}
	if (!Settings.read("showArchive")) {
		$(".mail .archive, .basicNotificationWindow .archive").hide();
	}
	if (!Settings.read("showSpam")) {
		$(".mail .spam, .basicNotificationWindow .spam").hide();
	}
	if (!Settings.read("showDelete")) {
		$(".mail .delete, .basicNotificationWindow .delete").hide();
	}
	if (!Settings.read("showReply")) {
		$(".mail .reply, .basicNotificationWindow .reply").hide();
	}
	if (!Settings.read("showOpen")) {
		$(".mail .open, .basicNotificationWindow .open").hide();
	}
	if (!Settings.read("showMarkAsRead")) {
		$(".mail .markAsRead").addClass("alwaysHide");
	}
	if (!Settings.read("showMarkAsUnread")) {
		$(".mail .markAsUnread").addClass("alwaysHide");
	}
}

$(document).ready(function() {
	$("#testOutAdvancedNotification").click(function() {
		bg.pollAccounts(function() {
			if (bg.unreadCount) {
				if (bg.notification) {
					bg.notification.cancel();
				}
				setTimeout(function() {
					bg.showNotification({showAdvancedNotification:true});
				}, 500);
			} else {
				alert(getMessage("advancedNotificationTryItOutInstructions"));
			}
		});
	});
});