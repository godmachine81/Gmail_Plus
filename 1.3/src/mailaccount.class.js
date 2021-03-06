function MailAccount(settingsObj) {
	
	this.id;
	this.status;
	
   var requestTimeout = 10000;

   // Check global settings
   var pollInterval = Settings.read("poll");

   // Always use SSL, things become messy otherwise
   var MAIL_DOMAIN = "https://mail.google.com"; 
   var mailURL = MAIL_DOMAIN;

   if (settingsObj.domain != null) {
      // This is a GAFYD account
      mailURL += "/a/" + settingsObj.domain + "/";
   } else if (settingsObj.accountNr != null) {
      // This is a Google account with multiple sessions activated
      mailURL += "/mail/u/" + settingsObj.accountNr + "/";
      this.id = settingsObj.accountNr;
   } else {
      // Standard one-session Gmail account
      mailURL += "/mail/";
   }

   var mailArray = new Array();
   var newestMailArray = new Array();
   var lastTotalEmailsFromPreviousFeed;
   var lastEmailFromPreviousFeed;
   var unreadCount = -1;
   var mailTitle;
   var mailAddress;
   var gmailAt = null;
   var errorLives = 3;
   var isStopped = false;
   var requestTimer;

   var labels = null;

   // Debug output (if enabled, might cause memory leaks)
   var verbose = true;

   // Without this/that, no internal calls to onUpdate or onError can be made...
   var that = this;
   
   function filterEmailBody(body) {
	   if (body) {
		   var regexs = new Array();
		   
		   regexs.push(/^(.*) on [a-z]{3}, [a-z]{3} \d+/i); //blah... On Wed, Dec 28, 2011 at 12:36 AM, 
		   regexs.push(/^(.*) on [a-z]{3} \d+\/\d+\/\d+/i); //blah... On Wed 15/02/12  8:23 AM ,
		   regexs.push(/^(.*) on \d\d\d\d[\/|-]\d\d[\/|-]\d\d/i); // dorks, thanks a million. 2011/12/28 
		   regexs.push(/^(.*) \d\d\d\d[\/|-]\d\d[\/|-]\d\d/i); // dorks, thanks a million. 2011/12/28 
		   regexs.push(/^(.*) original message/i);
		   regexs.push(/^(.*) ?sent from: /i);
		   regexs.push(/^(.*) ?envoyé de mon i/i);
		   regexs.push(/^(.*) ?cc: /i);
		   regexs.push(/^(.*) date: /i); // removed the '?' because the word up'date' would stop the filter
		   regexs.push(/^(.*) ?from: /i); 
		   
		   for (var a=0; a<regexs.length; a++) {
			   // max this interal loop to 10: just in case it goes on forever
			   // by the way we re-passing the same regex several times until all occurences of ie from" are gone... "Hello1 from: Hello2 from:"
			   for (var b=0; b<10; b++) {
				   var matches = body.match(regexs[a]);
				   if (matches && matches.length >= 2) {
					   body = matches[1];
				   } else {
					   break;
				   }
			   }
		   }
		   return $.trim(body);
	   }
   }
   
   function groupConversations(emails, emailsInFeed) {
	   console.log("group conversations");
	   // start from old to newest
	   for (var a=emails.length-1; a>=0; a--) {
		   var mail = emails[a];
		   if (!mail.conversationParent) {
			   // check for conversations with this subject
			   for (var b=a-1; b>=0; b--) {
				   var conversation = emails[b];
				   if (mail.title == conversation.title) {
					   console.log("found same subject: " + mail.title);
					   
					   // check if i should avoid grouping conversation if they are not group by gmail itself
					   var foundInEmailsFeed = false;
					   $.each(emailsInFeed, function(i, emailInFeed) {
						   if (emailInFeed.id == mail.id) {
							   foundInEmailsFeed = true;
							   return false;
						   }
					   });
					   
					   console.log("foundInEmailsFeed: " + foundInEmailsFeed);
					   if (!foundInEmailsFeed) {
						   // make sure not already added to conversations
						   var alreadyAdded = false;
						   for (var c=0; c<mail.conversations.length; c++) {
							   if (mail.conversations[c].id == conversation.id) {
								   alreadyAdded = true;
								   break;
							   }
						   }
						   if (!alreadyAdded) {
							   
							   mail.conversations.push(conversation);
							   conversation.conversationParent = mail;
							   
							   /*
							   // same sender, so group it
							   var addConversationToMain = false;
							   console.log(mail.authorMail + " " + conversation.authorMail);
							   if (mail.authorMail == conversation.authorMail) {
								   console.log("same sender")
								   addConversationToMain = true;
							   } else {
								   // see if this sender is in the main conversations to/ccs
								   if (mail.contributors) {
									   mail.contributors.each(function(i, contributor) {
										   console.log("main contribs mail: " + $(contributor).find("email").text() + " conv contrib: " + conversation.authorMail);
										   if ($(contributor).find("email").text() == conversation.authorMail) {
											   console.log("senderFoundInMainConversation");
											   addConversationToMain = true;
											   return false;
										   }
									   });
								   }
							   }

							   if (addConversationToMain) {
								   mail.conversations.push(conversation);
								   conversation.conversationParent = mail;
							   }
							   //emails.splice(b, 1);
							   //b--;
							   */
						   }
					   }
				   }
			   }
		   }
	   }
   }
   
   function getFeed(params, callback) {
	   
	   // finished with feeds so exit/callback
	   if (params.monitorLabelsIndex >= params.monitorLabels.length) {
		   callback(params);
	   } else {	   
		   
		   logToConsole("requesting " + mailURL + "feed/atom/" + params.monitorLabels[params.monitorLabelsIndex]);
	
		   var labelParam = params.monitorLabels[params.monitorLabelsIndex];
		   if (labelParam) {
			   labelParam = escape(labelParam);
			   labelParam = labelParam.replace(/\//g, "-"); // slashes must had to replaced with - to work (yeah that's gmail wants it
		   } else {
			   labelParam = "";
		   }
		   
		   $.ajax({
			   type: "GET",
			   dataType: "text",
			   url: mailURL + "feed/atom/" + labelParam + "?timestamp=" + Date.now(),
			   timeout: requestTimeout,
			   complete: function(jqXHR, textStatus) {
				   
				   // test flag
				   var TEST_FAIL = false;
				   if (TEST_FAIL && that.id == 0) {				   
					   textStatus = "mailtimeout";
				   } else {
					   TEST_FAIL = false;
				   }
				   
				   if (textStatus == "success") {
					   that.error = null;
					   
					   
					   var parser = new DOMParser();
					   parsedFeed = $(parser.parseFromString(jqXHR.responseText, "text/xml"));
					   
					   var titleNode = parsedFeed.find('title');
					   if (titleNode.length >= 1) {			   
						   mailTitle = $(titleNode[0]).text().replace("Gmail - ", "");
						   
						   
						   var emails = mailTitle.match(/([\S]+@[\S]+)/ig);
						   mailAddress = emails.last();
						   
						   var ignoreEmailFound = false;
						   var ignoreEmailsStr = Settings.read("ignoreEmails");
						   if (ignoreEmailsStr) {
							   var ignoreEmailsArray = ignoreEmailsStr.split(",");
							   $.each(ignoreEmailsArray, function(i, ignoreEmail) {
								   if (mailAddress == $.trim(ignoreEmail.toLowerCase())) {
									   ignoreEmailFound = true;
									   return false;
								   }
							   });
						   }
						   
						   if (ignoreEmailFound || (Settings.read("check_gmail_off") && mailAddress && mailAddress.indexOf("@gmail") != -1)) {
							   callback({ignored:true});
							   return;
						   }
					   }
					   
					   // If previousMonitorLabel not matching current then we are probably fetching this feed for the first time and so now we have the email address, we must now check if the user selected a different label to monitor for this email address, if so stop this one and call the feed again
					   console.log("params: ", params.monitorLabels)
					   console.log("getmonitors: ", that.getMonitorLabels())
					   if (params.monitorLabels.toString() != that.getMonitorLabels().toString()) {
						   // this is a safety flag so that they we don't endless recursiveily call getEmails()
						   if (params.fetchFeedAgainSinceMonitorLabelIsDifferent) {
							   that.error = "JError: recursive error with label";
							   callback({error:that.error, jqXHR:jqXHR});
						   } else {					   
							   // update monitor labels and send it again
							   console.log("call again since fetchFeedAgainSinceMonitorLabelIsDifferent");
							   params.monitorLabels = that.getMonitorLabels();
							   params.fetchFeedAgainSinceMonitorLabelIsDifferent = true;
							   getFeed(params, callback);
						   }
					   } else {
						   
						   // add the parsed feeds and continue for more						   
						   var feedInfo = {label:params.monitorLabels[params.monitorLabelsIndex], parsedFeed:parsedFeed};
						   
						   params.feedsArrayInfo.push(feedInfo);
						   params.monitorLabelsIndex++;
						   
						   getFeed(params, callback);
					   }
	
				   } else {
					   // jqXHR.status = 401 = unauthorized, 0=timeout
					   // jqXHR.statusText = unauthorized, timeout
					   // textStatus (param) "success", "notmodified", "error", "timeout", "abort", or "parsererror"
					   
					   if (errorLives > 0) {		   
						   errorLives--;
					   }
					   
					   console.warn("error: " + jqXHR.statusText + " erorrlives: " + errorLives);
					   
					   if (errorLives == 0) {
						   errorLives = -1;
	
						   //unreadCount = -1;
						   //mailArray = new Array();
					   }
					   
					   if (TEST_FAIL) {
						   setTimeout(function() {
							   that.error = "timeout";
							   callback({error: that.error, jqXHR:jqXHR});
							   //dfd.reject(jqXHR.statusText);
						   }, 4000);
					   } else {
						   that.error = jqXHR.statusText;
						   callback({error: jqXHR.statusText, jqXHR:jqXHR});
						   //dfd.reject(jqXHR.statusText);
					   }
				   }
			   }
		   });
	   }
   }

   // Retreives inbox count and populates mail array
   this.getEmails = function(getEmailParams, callback) {
	   var dfd = new $.Deferred();
	   
	   if (!callback) {
		   callback = function() {};
	   }
	   
	   // recursively fetch all feeds
	   getFeed({monitorLabels:that.getMonitorLabels(), monitorLabelsIndex:0, feedsArrayInfo:[]}, function(cbParams) {
		   
		   if (cbParams.ignored) {
			   callback(cbParams);
			   dfd.resolve("success");
		   } else if (cbParams.error) {
			   callback(cbParams);
			   dfd.reject(cbParams.error);
		   } else {

			   unreadCount = 0;
			   
			   var emailsInFeeds = new Array();
			   newestMailArray = new Array();

			   $.each(cbParams.feedsArrayInfo, function(i, feedInfo) {
				   
				   feedUnreadCount = Number(feedInfo.parsedFeed.find('fullcount').text());
				   // patch: because fullcount is always 0 for important or allmail (https://github.com/aceat64/MailCheckerMinus/issues/15 or banko.adam@gmail.com)
				   if (!feedUnreadCount) {
					   feedUnreadCount = Number(feedInfo.parsedFeed.find('entry').length);
				   }				   
				   unreadCount += feedUnreadCount;
				   
				   // Parse xml data for each mail entry
				   feedInfo.parsedFeed.find('entry').each(function () {
					   
					   var $entry = $(this);
					   
					   var title = $entry.find('title').text();
					   var shortTitle = title;
					   
					   var summary = $entry.find('summary').text();
					   summary = filterEmailBody(summary);
					   
					   var issued = Date.parse($entry.find('issued').text());
					   var link = $entry.find('link').attr('href');
					   var id = link.replace(/.*message_id=(\d\w*).*/, "$1");
					   var authorName = $entry.find('author').find('name').text();
					   var authorMail = $entry.find('author').find('email').text();
					   var contributors = $entry.find("contributor");

					   // Data checks
					   if (authorName == null || authorName.length < 1)
						   authorName = "(unknown sender)";

					   var MAX_SHORT_TITLE = 55;
					   if (title == null || title.length < 1) {
						   //shortTitle = title = "(No subject)";
					   } else {
						   shortTitle = title; //.summarize(MAX_SHORT_TITLE);
					   }

					   // Encode content to prevent XSS attacks
					   title = Encoder.XSSEncode(title, true);
					   shortTitle = Encoder.XSSEncode(shortTitle, true);
					   summary = Encoder.XSSEncode(summary, true);
					   authorMail = Encoder.XSSEncode(authorMail, true);
					   authorName = Encoder.XSSEncode(authorName, true);

					   // Construct a new mail object
					   var mailObject = {
						   account: that,
						   "id": id,
						   "title": title,
						   "shortTitle": shortTitle,
						   "summary": summary,
						   "link": link,
						   "issued": issued,
						   "authorName": authorName,
						   "authorMail": authorMail,
						   label: feedInfo.label,
						   froms: new Array(),
						   contributors: contributors,
						   getShortName: function() {
							   return mailObject.authorName.split(" ")[0];
						   },
						   open: function() {
							   findOrOpenGmailTab(mailObject);
						   },
						   markAsRead: function(callback) {
							   postAction({ "threadid": mailObject.id, "action": "rd" }, callback);
						   },
						   markAsUnread: function(callback) {
							   postAction({ "threadid": mailObject.id, "action": "ur" }, callback);
						   },
						   markAsSpam: function(callback) {
							   postAction({ "threadid": mailObject.id, "action": "sp" }, callback);
						   },
						   applyLabel: function(label, callback) {
							   postAction({ "threadid": mailObject.id, "action": "ac_" + label }, callback);
						   },
						   deleteEmail: function(callback) {
							   mailObject.markAsRead(function() {
								   postAction({ "threadid": mailObject.id, "action": "tr" }, callback);
							   });
						   },
						   archive: function(callback) {
							   if (Settings.read("archive_read")) {
								   mailObject.markAsRead(function() {
									   postAction({ "threadid": mailObject.id, "action": "arch" }, callback);
								   })
							   } else {
								   postAction({ "threadid": mailObject.id, "action": "arch" }, callback);
							   }
						   },
						   star: function(callback) {
							   if (mailObject.label) { // == "unread"
								   postAction({ "threadid": mailObject.id, actionParams: "tact=st&nvp_tbu_go=Go&s=a" }, callback);
							   } else if (mailObject.label == "") { //inbox usually
								   postAction({ "threadid": mailObject.id, "action": "st" }, callback);
							   } else {
								   // a particular label
								   //postAction({ "threadid": mailObject.id, actionParams: "tact=st&nvp_tbu_go=Go&s=l&l=" + label }, callback);
							   }
						   },
						   reply: function(callback) {
							   var to = encodeURIComponent(mailObject.authorMail); // Escape sender email
							   var subject = Encoder.htmlDecode(mailObject.title); // Escape subject string
							   subject = (subject.search(/^Re: /i) > -1) ? subject : "Re: " + subject; // Add 'Re: ' if not already there
							   subject = encodeURIComponent(subject);
							   var threadbody = "\r\n\r\n" + mailObject.issued.toString() + " <" + mailObject.authorMail + ">:\r\n" + Encoder.htmlDecode(mailObject.summary);
							   threadbody = encodeURIComponent(threadbody);
							   var replyURL = mailObject.account.getURL() + "?view=cm&tf=1&to=" + to + "&su=" + subject + "&body=" + threadbody;
							   if (Settings.read("replyingMarksAsRead")) {
								   mailObject.markAsRead(function() {
									   
								   });
							   }
							   if (Settings.read("open_tabs")) {
								   chrome.tabs.create({ url: replyURL });
							   } else {
								   window.open(replyURL, 'Compose new message', 'width=640,height=580');
								   //chrome.windows.create({url: replyURL});
							   }
						   },
						   getBody: function(callback) {
							   if (mailObject.body) {
								   callback({body:mailObject.body})
							   } else {
								   fetchThread(mailObject, callback);
							   }
						   },
						   getThread: function(callback) {
							   return fetchThread(mailObject, callback);
						   },
						   getLastThreadText: function() {
								if (mailObject.threadText) {
									return mailObject.threadText;
								} else {
									return mailObject.summary;
								}			
						   },
						   generateAuthorsNode: function(shortVersion) {
							   var $node;
							   if (mailObject.contributors.length >= 1) {
								   //var html = "<span>" + mail.froms.first().name.split(" ")[0] + "</span>";
								   // the feed does not put the original author as first contributor if they have replied in the thread (ie. last author) so make sure they're first if so
								   var name = "someone";
								   var nextContributorIndex = 0;
								   if (mailObject.froms.length) {
									   if (mailObject.froms.first().email == mailObject.contributors.last().find("email").text()) {
										   console.log("last contr is valid original author: " + mailObject.froms.first().email);
										   name = mailObject.contributors.last().find("name").text().split(" ")[0];
										   nextContributorIndex = 0;
									   } else {
										   name = mailObject.froms.first().name.split(" ")[0];
										   nextContributorIndex = 1;
									   }
								   } else {
									   if (mailObject.contributors.length) {
										   name = mailObject.contributors.first().find("name").text().split(" ")[0];
									   }
								   }
								   var html = "<span>" + name + "</span>";

								   // if more conversations than contributors (happens when several exchanges are done from the original author)
								   if (mailObject.froms.length > mailObject.contributors.length+1) {
									   html += " .. <span class='unread'>" + mailObject.getShortName() + "</span> (" + (mailObject.froms.length) + ")";
								   } else {
									   if (shortVersion) {
										   if (mailObject.contributors.length == 2) {
											   html += ", ";
										   } else {
											   html += " .. ";
										   }
										   html += "<span class='unread'>" + mailObject.getShortName() + "</span> (" + (mailObject.froms.length) + ")";
									   } else {
										   if (mailObject.contributors.length == 2) {						
											   html += ", <span>" + mailObject.contributors.eq(nextContributorIndex).find("name").text().split(" ")[0] + "</span>";
										   } else if (mailObject.contributors.length >= 3) {
											   html += " .. <span>" + mailObject.contributors.first().find("name").text().split(" ")[0] + "</span>";
										   }
	
										   html += ", <span class='unread'>" + mailObject.getShortName() + "</span> (" + (mailObject.froms.length) + ")";
									   }
								   }

								   $node = $(html);
							   } else {
								   $node = $("<span/>");					   
								   $node
								   		.html( mailObject.authorName )
								   		.addClass("unread")
								   		.attr("title", mailObject.authorMail)
								   ;
							   }
							   return $node;
						   }
					   };
					   
					   // actual emails in feed (used to double check if i should avoid grouping conversations if they are not group by gmail itself
					   emailsInFeeds.push(mailObject);

					   var isNewMail = true;
					   $.each(mailArray, function (i, oldMail) {
						   if (oldMail.id == mailObject.id) {
							   //console.log("old mail");
							   isNewMail = false; // This mail is not new
							   return false;
						   }			   
					   });
					   
					   if (isNewMail) {
						   console.log("isNewMail");
						   newestMailArray.push(mailObject);
					   }
				   });				   
				   
			   });

			   
			   // remove emails that have disappeared from the feed (user could have done any number of actions on the emails via the gmail.com etc.
			   for (var a=0; a<mailArray.length; a++) {
				   var emailStillInFeed = false; 
				   for (var b=0; b<emailsInFeeds.length; b++) {
					   if (mailArray[a].id == emailsInFeeds[b].id) {
						   emailStillInFeed = true;
						   break;
					   }
				   }
				   if (!emailStillInFeed) {
					   console.log("removing: " + mailArray[a].title);
					   mailArray.splice(a, 1);
					   a--;
				   }
			   }

			   mailArray = mailArray.concat(newestMailArray);
			   mailArray.sort(function (a, b) {
				   if (a.issued > b.issued)
					   return -1;
				   if (a.issued < b.issued)
					   return 1;
				   return 0;
			   });
			   
			   var MAX_GET_THREADS = 20;
			   var getThreadsCount = 0;
			   var deferreds = new Array();

			   $.each(newestMailArray, function(i, email) {
				   // lots of peeps in the thread so this might be a reply to a conversation (but which was already 'read' by user before so this check does not know the thread's past or initial email etc.) (and thus the summary in the Gmail's feed will not match what this sender wrote, but rather it matches summary of the first email in this thread
				   if (true) { //email.contributors.length || Settings.read("spokenWordsLimit") == "paragraph" || Settings.read("spokenWordsLimit") == "wholeEmail") { 
					   //console.log("has contributors: " + email.contributors.length + " or spokenwordslimit high");
					   if (getThreadsCount < MAX_GET_THREADS) {
						   var deferred = email.getThread();
						   deferreds.push(deferred);
						   getThreadsCount++;
					   } else {
						   console.log("MAX fetch last conversations reached, ignoring now.");						   
					   }
				   }
			   });

			   if (deferreds.length) {
				   console.log("deferreds: ", deferreds);
			   }
			   
			   $.when.apply($, deferreds).always(function() {
				   cbParams.mailAccount = that;
			   	   cbParams.newestMailArray = newestMailArray;
				   callback(cbParams);
				   dfd.resolve("success");
			   });
			   
		   }
		   
	   });
	   

	   return dfd.promise();
   }

   function logToConsole(text) {
      if (verbose) {
         console.log(text);
      }
   }

   // Send a POST action to Gmail
   function postAction(postObj, callback) {
	   if (!callback) {
		   callback = function() {};
	   }
	   if (gmailAt == null) {
		   getAt(function() { postAction(postObj, callback); });
	   } else {
		   var threadid = postObj.threadid;
		   var actionParams;
		   if (postObj.action) {
			   actionParams = "act=" + postObj.action;
		   } else if (postObj.actionParams) {
			   actionParams = postObj.actionParams;
		   }			   

		   var postURL = mailURL.replace("http:", "https:");
		   postURL += "h/" + Math.ceil(1000000 * Math.random()) + "/";
		   var postParams = "t=" + threadid + "&at=" + gmailAt + "&" + actionParams;

		   logToConsole(postURL);
		   logToConsole(postParams);

		   var postXHR = new XMLHttpRequest();
		   postXHR.onreadystatechange = function () {
			   if (this.readyState == 4 && this.status == 200) {
				   // Post successful! Refresh once
				   that.getEmails();
				   callback({});
			   } else if (this.readyState == 4 && this.status == 401) {
				   callback({error:"Unauthorized"});
			   }
		   }
		   postXHR.onerror = function (error) {
			   logToConsole("post action error: " + error);
			   callback({error:error});
		   }

		   postXHR.open("POST", postURL, true);
		   postXHR.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		   postXHR.send(postParams);
	   }
   }

   // Opens the basic HTML version of Gmail and fetches the Gmail_AT value needed for POST's
   function getAt(callback) {
	   var getURL = mailURL + "h/" + Math.ceil(1000000 * Math.random()) + "/?ui=html&zy=c";
	   var gat_xhr = new XMLHttpRequest();
	   gat_xhr.onreadystatechange = function () {
		   if (this.readyState == 4 && this.status == 200 && this.responseText) {
			   var matches = this.responseText.match(/\at=([^"]+)/);
			   if (matches != null && matches.length > 0) {
				   gmailAt = matches[1];
				   console.log("get at: " + gmailAt);
				   if (callback != null) {
					   callback();
				   }
			   }
		   } else if (this.readyState == 4 && this.status == 401) {

		   }
	   }
	   gat_xhr.onerror = function (error) {
		   logToConsole("get gmail_at error: " + error);
	   }
	   gat_xhr.open("GET", getURL, true);
	   gat_xhr.send(null);
   }

   // Opens the inbox
   this.openInbox = function () {
      logToConsole('Opening inbox');
      findOrOpenGmailTab();
   }

   function findSpecificMailURL(mail) {
	   chrome.tabs.query({url:mailURL + "*"}, function(tabs) {
		   console.log("tabs fond: ", tabs);
		   if (tabs && tabs.length >= 1) {
			   loadMailInGmailTab(tabs[0], mail);
		   } else {
			   var newURL = mailURL + that.getOpenLabel();
			   if (mail) {
				   newURL += "/" + mail.id;
			   }
			   createTab(newURL);
		   }
	   });
   }
   
   function loadMailInGmailTab(tab, mail, callback) {
	   // focus window
	   chrome.windows.update(tab.windowId, {focused:true}, function() {
		   // focus/update tab
		   var newURL = tab.url.split("#")[0] + that.getOpenLabel();
		   if (mail) {
			   newURL += "/" + mail.id;
		   }
		   // if same url then don't pass url parameter or else chrome will reload the tab
		   if (tab.url == newURL) {
			   chrome.tabs.update(tab.id, {active:true}, callback);
		   } else {
			   chrome.tabs.update(tab.id, {active:true, url:newURL}, callback);
		   }
	   });
   }
   
   function findOrOpenGmailTab(mail) {
	   // if 1st then look for default url just /mail/ and not /mail/u/0/
	   if (mailURL.indexOf("/mail/u/0") != -1) {
		   chrome.tabs.query({url:MAIL_DOMAIN + "/mail/" + "*"}, function(tabs) {
			   if (tabs && tabs.length >= 1) {
				   var foundRegularMailURL = false;
				   $.each(tabs, function(i, tab) {
					   // make sure we don't match any other non-default accounts
					   if (tab.url.indexOf("/mail/u/") == -1) {
						   foundRegularMailURL = true;
						   loadMailInGmailTab(tab, mail);
						   return false;
					   }
				   });
				   if (!foundRegularMailURL) {
					   findSpecificMailURL(mail);
				   }
			   } else {
				   findSpecificMailURL(mail);
			   }
		   });
	   } else {
		   findSpecificMailURL(mail);
	   }
	   
	   if (mail) {
		   mail.markAsRead(function() {
			   that.getEmails();
		   });
	   }
   }
   
   // Fetches content of thread
   function fetchThread(mail, callback) {
	   var dfd = new $.Deferred();

	   if (!callback) {
		   callback = function() {};
	   }

	   console.log("fetchthread: " + mail.title);
	   var getURL = mailURL.replace('http:', 'https:') + "h/" + Math.ceil(1000000 * Math.random()) + "/?v=pt&th=" + mail.id;

	   $.ajax({
		   type: "GET",
		   timeout: requestTimeout,
		   url: getURL,
		   complete: function(jqXHR, textStatus) {

			   if (textStatus == "success") {

				   mail.froms = new Array();

				   var $body = $("<div class='fullEmailBody'/>");

				   // need to add wrapper so that this jquery call workes "> table" ???
				   var $responseWrapper = $("<div id='$responseWrapper'/>");

				   var $responseText = $(jqXHR.responseText);
				   $responseWrapper.append($responseText); //jqXHR.responseText

				   var $tables;
				   
				   // before google changed print page layout
				   $tables = $responseWrapper.find("> table");
				   if ($tables.length) {
					   $tables = $tables.splice(0, 1);
				   } else {
					   // new layout
					   $tables = $responseWrapper.find(".maincontent .message");
				   }
				   if ($tables.length && $tables.each) {
					   $tables.each(function(i) {
						   // ignore first table: it's just a header 
						   //if (i >= 1) {
	
							   // identify main body of email
							   $(this).find("> tbody > tr:last-child").addClass("threadBody");
	
							   var $table = $("<table width='100%' class='thread'/>").append($(this));
	
							   // point relative links to gmail.com 
							   $table.find("a, img").each(function() {
								   var href = $(this).attr("href");
								   var src = $(this).attr("src");
								   if (href && href.indexOf("/") == 0) {
									   $(this).prop("href", "https://mail.google.com" + href);
								   } else if (src && src.indexOf("/") == 0) {
									   $(this).prop("src", "https://mail.google.com" + src);
								   }
							   });
	
							   // get from via by parsing this string:  John Poon <ccpedq@hotmail.com>
							   var from = $table.find("tr:eq(0)").find("td").first().text();
	
							   from = from.replace(/\n/g, "")
	
							   var fromName = from.split("<")[0];
							   fromName = fromName.split("@")[0]
							   fromName = $.trim(fromName);
	
							   var fromEmail = from.split("<")[1];
							   fromEmail = fromEmail.split(">")[0];
	
							   from = {name:fromName, email:fromEmail};
							   mail.froms.push(from);
	
							   // get date from first line ex. Chloe De Smet Allègre via LinkedIn <member@linkedin.com>	 Sun, Jan 8, 2012 at 12:14 PM
							   var dateStr = $table.find("tr:first").find("td").last().text();
							   dateStr = $.trim(dateStr);
	
							   // get to/CC
							   var $toCCHTML = $table.find("tr:eq(1)").find("td");
							   var cleanToCC = "";
	
							   var divs = $toCCHTML.find("div");
							   divs.each(function(i) {
	
								   // if 2 divs the first line is usually the reply-to line so ignore it
								   if (i == 0 && divs.length >= 2 && divs.eq(1).text().toLowerCase().indexOf("cc:") == -1) {
									   return true;
								   }
								   /*
								   if ($(this).text().toLowerCase().indexOf("reply-to:") == -1) {
									   var email = $(this).text().replace(/to:|cc:|bcc:/ig, "");
									   //email = email.replace(/\n/g, "");
									   email = email.replace(/"/g, "")
									   email = email.replace(/</g, "&lt;");
									   email = email.replace(/>/g, "&gt;");
									   email = email.replace("&quote;", "");
									   email = $.trim(email);
									   cleanToCC += email + ",";
								   }
								    */
								   var email = $(this).text().replace(/.*:/, "");
								   email = email.replace(/"/g, "")
								   email = email.replace(/</g, "&lt;");
								   email = email.replace(/>/g, "&gt;");
								   email = email.replace("&quote;", "");
								   email = $.trim(email);
								   cleanToCC += email + ",";
							   });
							   var cleanToCCArray = cleanToCC.split(",");
							   cleanToCC = getMessage("to") + " ";
							   $.each(cleanToCCArray, function(i) {
								   // it's this account's email so put 'me' instead
								   if (this.indexOf(that.getAddress()) != -1) {
									   cleanToCC += getMessage("me");
								   } else {
									   var firstName = $.trim(this).split(" ")[0].split("@")[0];
									   cleanToCC += firstName;
								   }
								   //if (cleanToCC.length > 40) {
								   //cleanToCC += "...";
								   //return false;
								   //} else {
								   if (i < cleanToCCArray.length-2) {
									   cleanToCC += ", ";
								   }
								   //}
							   });
	
							   var threadText = $table.find("tr:eq(2)").html();
							   threadText = htmlToText(threadText);
	
							   //var threadSummary = rawConversation;
							   threadText = threadText.replace("[Quoted text hidden]", "");
							   threadText = threadText.replace("[Texte des messages précédents masqué]", "");
	
							   threadText = filterEmailBody(threadText);
	
							   /*
							   var MAX_LENGTH = 101;
							   if (threadSummary) {
								   threadSummary = threadSummary.summarize(MAX_LENGTH);
							   }
							   */
	
							   // hide first messages
							   var lastConversationFlag;
							   if (i < $tables.length-1) {
								   //lastConversationFlag = false;
							   } else { // last thread in email
								   //lastConversationFlag = true;
								   //mail.rawConversation = rawConversation;
								   mail.threadText = threadText;
							   }
	
							   // remove first rows (1st one is from/date and 2nd is to:/cc: 
							   $table.find("tr:eq(0), tr:eq(1)").hide();
	
							   // this area will be filled-in with the mailtemplate
							   $td = $("<td colspan=10 class='fullEmailSenderArea'/>");
	
							   // must attr instead of data because jquery's data uses $.cache which is only within the scope of .html page so my popup.html doesn't see it
							   $td.attr("data-threadText", threadText);					   
							   $td.attr("data-from", JSON.stringify(from));
							   $td.attr("data-cleanToCC", cleanToCC);
							   $td.attr("data-toCCHTML", $toCCHTML.html());
							   $td.attr("data-dateStr", dateStr);					   
	
							   $tr = $("<tr/>").append($td);
							   $table.prepend($tr);
	
							   $body.append($table);
	
							   mail.body = $body;
						   //}					   
					   });
				   } else {
					   mail.threadText = htmlToText($responseText.text());
					   $body = $responseText;
				   }
				   
				   callback({body:$body});
				   dfd.resolve("success");			   

			   } else {
				   callback({error:jqXHR.statusText});
				   dfd.reject(jqXHR.statusText);
			   }
		   }
	   });

	   return dfd.promise();
   }
   
   this.getMonitorLabels = function() {
	   var monitorLabels;
		var emailSettings = Settings.read("emailSettings");
		if (emailSettings) {
			var emailSettingsPairs = emailSettings[that.getAddress()];
			if (emailSettingsPairs) {
				monitorLabels = emailSettingsPairs.monitorLabel;
			} else {
				monitorLabels = Settings.read("check_label");
			}
		} else {
			// never set so return default settings
			monitorLabels = Settings.read("check_label"); 
		}
		
		// legacy code to convert string to an array with that string
		if (!$.isArray(monitorLabels)) {
			monitorLabels = new Array(monitorLabels);
		}
		return monitorLabels;
   }

   this.getOpenLabel = function() {
		var emailSettings = Settings.read("emailSettings");
		if (emailSettings) {
			var emailSettingsPairs = emailSettings[that.getAddress()];
			if (emailSettingsPairs) {
				return emailSettingsPairs.openLabel;
			} else {
				return Settings.read("open_label");
			}
		} else {
			// never set so return default settings
			return Settings.read("open_label"); 
		}
  }

   // Retrieves unread count
   this.getUnreadCount = function () {
	   if (unreadCount <= 0) {
		   return 0;
	   } else {
		   return unreadCount;
	   }
   }

   // Returns the email address for the current account
   this.getAddress = function () {
	   if (mailAddress) {
		   return mailAddress;
	   } else {
		   return mailURL;
	   }
   }

   // Returns the mail array
   this.getMail = function () {
	   return mailArray;
   }

   // Returns the newest mail
   this.getNewestMail = function () {
	   return newestMailArray.first();
   }

   // Returns the mail URL
   this.getURL = function () {
      return mailURL;
   }

   this.getNewAt = function () {
      getAt();
   }

   this.getLabels = function(callback) {
	   if (labels) {
		   callback({labels:labels});
	   } else {
		   $.ajax({
			   type: "GET",
			   dataType: "text",
			   url: mailURL,
			   timeout: 7000,
			   success: function (data) {
				   try {
					   var startIndex = data.lastIndexOf('var GLOBALS=') + 12;
					   var endIndex = data.lastIndexOf(';GLOBALS[0]');
					   var length = endIndex - startIndex;

					   var globals = eval(data.substr(startIndex, length));

					   if (globals) {
						   // Parse labels from globals
						   labels = new Array();
						   $.each(globals[17][1][2], function (i, val) { labels.push(val[0]); });
						   //labels.push("spam");
					   }
				   } catch (e) {
					   console.error("An error occured while parsing globals: " + e);
				   }
				   callback({labels:labels});
			   },
			   error: function (xhr, status, err) {
				   console.error("An error occured while fetching globals: " + xhr + " " + status + " " + err);
				   // Try again in 30 seconds
				   //window.setTimeout(getGLOBALS, 30 * 1000);
				   
				   callback({error:err});
			   }
		   });
 	   }
  }
}
