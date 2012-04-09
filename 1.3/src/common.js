// Becareful because this common.js file is loaded on websites for content_scripts and we don't want errors here

var ONE_SECOND = 1000;
var ONE_MINUTE = 60000;
var ONE_HOUR = ONE_MINUTE * 60;
var ONE_DAY = ONE_HOUR * 24;
var origConsoleLog = null;
var origConsoleWarn = null;
var origConsoleDebug = null;
Calendar = function () {};

jQuery.fn.exists = function(){return jQuery(this).length>0;}
jQuery.fn.textNodes = function() {
	var ret = [];

	(function(el){
		if (!el) return;
		if ((el.nodeType == 3)||(el.nodeName =="BR"))
			ret.push(el);
		else
			for (var i=0; i < el.childNodes.length; ++i)
				arguments.callee(el.childNodes[i]);
	})(this[0]);
	return $(ret);
}
jQuery.fn.hasHorizontalScrollbar = function() {
    var divnode = this.get(0);
    if (divnode.scrollWidth > divnode.clientWidth) {
        return true;
    } else {
    	return false;
    }
}

jQuery.fn.hasVerticalScrollbar = function() {
    var divnode = this.get(0);
    if (divnode.scrollHeight > divnode.clientHeight) {
        return true;
    } else {
    	return false;
    }
}

function removeHTML(html) {
   var tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return tmp.textContent||tmp.innerText;
}

function loadLocaleMessages(lang, callback) {
	// only load locales from files if they are not using their navigator langauge 
	if (lang == window.navigator.language.substring(0,2)) {
	//if (/en/i.test(lang) && /en/i.test(window.navigator.language)) {
		// for english just use native calls to get i18n messages
		chrome.extension.getBackgroundPage().localeMessages = null;
		callback();
	} else {
		console.log("loading locale: " + lang);
		$.ajax({
			url: './_locales/' + lang.replace("-", "_") + '/messages.json',
			type: "GET",
			timeout: 5000,
			complete: function(request, textStatus) {
				var status = getStatus(request, textStatus);
				if (status == 200) {
					chrome.extension.getBackgroundPage().localeMessages = JSON.parse(request.responseText);					
				} else {
					// not found status usually 404					
				}
				callback();
			}
		});		
	}
}

function getMessage(messageID, args, localeMessages) {
	// if localeMessage null because english is being used and we haven't loaded the localeMessage
	if (!localeMessages) {
		try {
			localeMessages = chrome.extension.getBackgroundPage().localeMessages;
		} catch (e) {
			// might be in content_script and localMessages not defined because it's in english
			return chrome.i18n.getMessage(messageID, args);
		}				
	}
	if (localeMessages) {
		var messageObj = localeMessages[messageID];	
		if (messageObj) { // found in this language
			var str = messageObj.message;
			if (args) {
				if (args instanceof Array) {
					for (var a=0; a<args.length; a++) {
						str = str.replace("$" + (a+1), args[a]);
					}
				} else {
					str = str.replace("$1", args);
				}
			}
			return str;
		} else { // default to default language
			return chrome.i18n.getMessage(messageID, args);
		}
	} else {
		return chrome.i18n.getMessage(messageID, args);
	}
}

var dateFormat = function () {
	var	token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
		timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
		timezoneClip = /[^-+\dA-Z]/g,
		pad = function (val, len) {
			val = String(val);
			len = len || 2;
			while (val.length < len) val = "0" + val;
			return val;
		};

	// Regexes and supporting functions are cached through closure
	return function (date, mask, utc, forceEnglish) {
		var dF = dateFormat;
		var i18n = forceEnglish ? dF.i18nEnglish : dF.i18n;

		// You can't provide utc if you skip other args (use the "UTC:" mask prefix)
		if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
			mask = date;
			date = undefined;
		}

		// Passing date through Date applies Date.parse, if necessary
		date = date ? new Date(date) : new Date;
		if (isNaN(date)) throw SyntaxError("invalid date");

		mask = String(dF.masks[mask] || mask || dF.masks["default"]);

		// Allow setting the utc argument via the mask
		if (mask.slice(0, 4) == "UTC:") {
			mask = mask.slice(4);
			utc = true;
		}

		var	_ = utc ? "getUTC" : "get",
			d = date[_ + "Date"](),
			D = date[_ + "Day"](),
			m = date[_ + "Month"](),
			y = date[_ + "FullYear"](),
			H = date[_ + "Hours"](),
			M = date[_ + "Minutes"](),
			s = date[_ + "Seconds"](),
			L = date[_ + "Milliseconds"](),
			o = utc ? 0 : date.getTimezoneOffset(),
			flags = {
				d:    d,
				dd:   pad(d),
				ddd:  i18n.dayNamesShort[D],
				dddd: i18n.dayNames[D],
				m:    m + 1,
				mm:   pad(m + 1),
				mmm:  i18n.monthNamesShort[m],
				mmmm: i18n.monthNames[m],
				yy:   String(y).slice(2),
				yyyy: y,
				h:    H % 12 || 12,
				hh:   pad(H % 12 || 12),
				H:    H,
				HH:   pad(H),
				M:    M,
				MM:   pad(M),
				s:    s,
				ss:   pad(s),
				l:    pad(L, 3),
				L:    pad(L > 99 ? Math.round(L / 10) : L),
				t:    H < 12 ? "a"  : "p",
				tt:   H < 12 ? "am" : "pm",
				T:    H < 12 ? "A"  : "P",
				TT:   H < 12 ? "AM" : "PM",
				Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
				o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
				S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
			};

		return mask.replace(token, function ($0) {
			return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
		});
	};
}();

// Some common format strings
dateFormat.masks = {
	"default":      "ddd mmm dd yyyy HH:MM:ss",
	shortDate:      "m/d/yy",
	mediumDate:     "mmm d, yyyy",
	longDate:       "mmmm d, yyyy",
	fullDate:       "dddd, mmmm d, yyyy",
	shortTime:      "h:MM TT",
	mediumTime:     "h:MM:ss TT",
	longTime:       "h:MM:ss TT Z",
	isoDate:        "yyyy-mm-dd",
	isoTime:        "HH:MM:ss",
	isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
	isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
dateFormat.i18n = {
	dayNamesShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
	dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
	monthNamesShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
	monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
};

dateFormat.i18nEnglish = $.extend(true, {}, dateFormat.i18n);
dateFormat.i18nCalendarLanguage = $.extend(true, {}, dateFormat.i18n);

// For convenience...
Date.prototype.format = function (mask, utc, forceEnglish) {
	return dateFormat(this, mask, utc, forceEnglish);
};

Date.prototype.formattedTime = function () {
	if (pref("24hourMode")) {
		return dateFormat(this, "HH:MM");
	} else {
		return dateFormat(this, "h:MMtt");
	}
};

Date.prototype.displayDate = function(withTimeAgo) {
	// date
	var dateStr;
	if (this.diffInHours() > -12) {
		if (pref("24hourMode")) {
			dateStr = this.format("HH:MM");
		} else {
			dateStr = this.format("h:MM TT");
		}
	} else {
		dateStr = this.format("mmm d");
	}
	
	if (withTimeAgo) {
		dateStr += " <span class='timeAgo'>("
		if (this.diffInMinutes() > -60) {
			dateStr += getMessage("minutesAgo", Math.abs(this.diffInMinutes()) + "")
		} else if (this.diffInHours() > -24) {
			if (Math.abs(this.diffInHours()) == -1) {
				dateStr += getMessage("hourAgo", Math.abs(this.diffInHours()) + "")
			} else {
				dateStr += getMessage("hoursAgo", Math.abs(this.diffInHours()) + "")
			}
		} else {
			if (Math.abs(this.diffInDays()) == 1) {
				dateStr += getMessage("dayAgo", Math.abs(this.diffInDays()) + "")
			} else {
				dateStr += getMessage("daysAgo", Math.abs(this.diffInDays()) + "")
			}				
		}
		dateStr += ")</span>";
	}
	return dateStr;
}

Date.parse = function(dateStr) {
	var DATE_TIME_REGEX = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.\d+(\+|-)(\d\d):(\d\d)$/;
	var DATE_TIME_REGEX_Z = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.\d+Z$/;
	var DATE_TIME_REGEX_Z2 = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)+Z$/;
	var DATE_MILLI_REGEX = /^(\d\d\d\d)(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)$/;
	var DATE_REGEX = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
	var DATE_NOSPACES_REGEX = /^(\d\d\d\d)(\d\d)(\d\d)$/;

	/* Convert the incoming date into a javascript date
	 * 2006-04-28T09:00:00.000-07:00
	 * 2006-04-28T09:00:00.000Z
	 * 2010-05-25T23:00:00Z 
	 * 2006-04-19
	 */
	var parts = DATE_TIME_REGEX.exec(dateStr);

	// Try out the Z version
	if (!parts) {
		parts = DATE_TIME_REGEX_Z.exec(dateStr);
	}
	if (!parts) {
		parts = DATE_TIME_REGEX_Z2.exec(dateStr);
	}

	if (exists(parts) && parts.length > 0) {
		var d = new Date();
		d.setUTCFullYear(parts[1], parseInt(parts[2], 10) - 1, parts[3]);
		d.setUTCHours(parts[4]);
		d.setUTCMinutes(parts[5]);
		d.setUTCSeconds(parts[6]);
		d.setUTCMilliseconds(0);

		var tzOffsetFeedMin = 0;
		if (parts.length > 7) {
			tzOffsetFeedMin = parseInt(parts[8],10) * 60 + parseInt(parts[9],10);
			if (parts[7] != '-') { // This is supposed to be backwards.
				tzOffsetFeedMin = -tzOffsetFeedMin;
			}
		}
		return new Date(d.getTime() + tzOffsetFeedMin * ONE_MINUTE); 
	}

	parts = DATE_MILLI_REGEX.exec(dateStr);
	if (exists(parts)) {
		var d = new Date();
		d.setFullYear(parts[1], parseInt(parts[2], 10) - 1, parts[3]);
		d.setHours(parts[4]);
		d.setMinutes(parts[5]);
		d.setSeconds(parts[6]);
		d.setMilliseconds(0);
		return d;
	}
	if (!parts) {
		parts = DATE_REGEX.exec(dateStr);
	}
	if (!parts) {
		parts = DATE_NOSPACES_REGEX.exec(dateStr);
	}
	if (exists(parts) && parts.length > 0) {
		return new Date(parts[1], parseInt(parts[2],10) - 1, parts[3]);
	}
	
	// Parse these strings...
	// Wed, Jan 25, 2012 at 1:53 PM
	// 25 janvier 2012 13:53
	// 25 января 2012 г. 13:53
	
	if (!isNaN(dateStr)) {
		return new Date(dateStr);
	}
	return null;
}

function nowInMillis() {
	return today().getTime();
}

function today() {
	var offsetToday = null;
	if (localStorage) {
		offsetToday = localStorage["today"];
	}
	if (offsetToday) {
		return new Date(offsetToday);
	} else {
		return new Date();
	}
}

function yesterday() {
	// could not use same variable name as function ie. var today = today();
	var yest = today();
	yest.setDate(yest.getDate()-1);
	return yest;
}

function tomorrow() {
	var tomorrow = today();
	tomorrow.setDate(tomorrow.getDate()+1);
	return tomorrow;
}

function isToday(date) {
	return date.getFullYear() == today().getFullYear() && date.getMonth() == today().getMonth() && date.getDate() == today().getDate();
}

function isTomorrow(date) {
	var tom = tomorrow();
	return date.getFullYear() == tom.getFullYear() && date.getMonth() == tom.getMonth() && date.getDate() == tom.getDate();
}

function isYesterday(date) {
	var yest = yesterday();
	return date.getFullYear() == yest.getFullYear() && date.getMonth() == yest.getMonth() && date.getDate() == yest.getDate();
}

function now() {
	return today();
}

Date.prototype.isToday = function () {
	return isToday(this);
};

Date.prototype.isTomorrow = function () {
	return isTomorrow(this);
};

Date.prototype.isYesterday = function () {
	return isYesterday(this);
};

Date.prototype.isSameDay = function (otherDay) {
	return this.getFullYear() == otherDay.getFullYear() && this.getMonth() == otherDay.getMonth() && this.getDate() == otherDay.getDate();
};

Date.prototype.isBefore = function(otherDate) {
	var paramDate;
	if (otherDate) {
		paramDate = new Date(otherDate);
	} else {
		paramDate = today();
	}	
	var thisDate = new Date(this);
	return thisDate.getTime() < paramDate.getTime();
};

Date.prototype.isAfter = function(otherDate) {
	return !this.isBefore(otherDate);
};

Date.prototype.diffInSeconds = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	var d2 = new Date(this);
	return Math.round(Math.ceil(d2.getTime() - d1.getTime()) / ONE_SECOND);
};

Date.prototype.diffInMinutes = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	var d2 = new Date(this);
	return Math.round(Math.ceil(d2.getTime() - d1.getTime()) / ONE_MINUTE);
};

Date.prototype.diffInHours = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	var d2 = new Date(this);
	return Math.round(Math.ceil(d2.getTime() - d1.getTime()) / ONE_HOUR);
};

Date.prototype.diffInDays = function(otherDate) {
	var d1;
	if (otherDate) {
		d1 = new Date(otherDate);
	} else {
		d1 = today();
	}	
	d1.setHours(1);
	d1.setMinutes(1);
	var d2 = new Date(this);
	d2.setHours(1);
	d2.setMinutes(1);
	return Math.round(Math.ceil(d2.getTime() - d1.getTime()) / ONE_DAY);
};

//Usage: array.forEach(item, index)
Array.prototype.forEach = function(action) {
    for (var i = 0, l = this.length; i < l; ++i) {
        var ret = action(this[i], i);
        // breaks if returns false or true but not just return;
        if (ret != undefined) {
        	break;
        }
    }
};
Array.prototype.first = function() {
	return this[0];
};
Array.prototype.last = function() {
	return this[this.length-1];
};
Array.prototype.isEmpty = function() {
	return this.length == 0;
};
Array.prototype.find = function(func) {
	for (var i = 0, l = this.length; i < l; ++i) {
		var item = this[i];
		if (func(item))
			return item;
	}
	return null;
};
Array.prototype.swap = function (x,y) {
	var b = this[x];
	this[x] = this[y];
	this[y] = b;
	return this;
}

Array.prototype.addItem = function(key, value) {
	for (var i=0, l=this.length; i<l; ++i) {
		if (this[i].key == key) {
			// found key so update value
			this[i].value = value;
			return;
		}
	}
	this.push({key:key, value:value});
}
Array.prototype.getItem = function(key) {
	for (var i=0, l=this.length; i<l; ++i) {
		if (this[i].key == key) {			
			return this[i].value;
		}
	}
}

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

String.prototype.summarize = function(maxLength) {
	if (!maxLength) {
		maxLength = 101;
	}
	var summary = this;
	if (summary.length > maxLength) {
		summary = summary.substring(0, maxLength);
		var lastSpaceIndex = summary.lastIndexOf(" ");
		if (lastSpaceIndex != -1) {
			summary = summary.substring(0, lastSpaceIndex);
			summary = $.trim(summary);
		}
		summary += "...";
	}
	// patch: do not why: but it seem that unless i append a str to summary, it returns an array of the letters in summary?
	return summary + "";
}

String.prototype.parseTime = function() {
	var d = new Date();
	var pieces = this.match(/(\d+)([:|\.](\d\d))\s*(p?)/i);
	if (pieces && pieces.length >= 5) {
		// patch: had to use parseFloat instead of parseInt (because parseInt would return 0 instead of 9 when parsing "09" ???		
		var hours = parseFloat(pieces[1]);
		var pm = pieces[4];
		
		// patch for midnight because 12:12am is actually 0 hours not 12 hours for the date object
		if (hours == 12) {
			if (pm) {
				hours = 12;
			} else {
				hours = 0;
			}
		} else if (pm) {
			hours += 12;
		}
		d.setHours(hours);		
		//d.setHours( parseFloat(pieces[1]) + ( ( parseFloat(pieces[1]) < 12 && pieces[4] ) ? 12 : 0) );
		d.setMinutes( parseFloat(pieces[3]) || 0 );
		d.setSeconds(0, 0);
		return d;
	}
}

function initAnalytics() {
	if (navigator.platform.toLowerCase().indexOf("mac") != -1 || navigator.platform.toLowerCase().indexOf("linux") != -1) {
		try {
			_gaq = _gaq || [];
		} catch (e) {
			_gaq = [];
		}
	} else {
		var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
		ga.src = 'src/analytics.js';
		var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
		$(document).ready(function() {
			$(document).on("click", "a, input, button", function() {
				processNodeForAnalytics(this);
			});
			$(document).on("change", "select", function() {
				processNodeForAnalytics(this);
			});
		});
	}		
} 

function determineAnalyticsLabel(node) {
	var $node = $(node);
	var id = $node.attr("ga");
	if (id == "IGNORE") {
		return;
	}
	id = $node.attr("id");
	if (id) {
		return id;
	}
	/*
	if ($node.hasClass("button") || $node.hasClass("icon")) {
		id = $node.attr("class").split(" ")[1];
		if (id) {
			return id;
		}
	}
	*/
	id = $node.attr("msg");
	if (id) {
		return id;
	}
	id = $node.attr("msgTitle");
	if (id) {
		return id;
	}
	id = $node.attr("href");
	// don't log # so dismiss it
	if (id) {
		if (id == "#") {
			return;
		} else {
			id = id.replace(/javascript\:/, "");
			// only semicolon so remove it and keep finding other ids
			if (id == ";") {
				return "";
			}
		}
	}
	id = $node.parent().attr("id");
	if (id) {
		return id;
	}
	id = $node.attr("class");
	if (id) {
		return id;
	}
}

function processNodeForAnalytics(node) {
	var $node = $(node);
	var label = null;
	var id = determineAnalyticsLabel(node);
	if (id) {
		if ($node.attr("type") != "text") {
			if ($node.attr("type") == "checkbox") {
				if (node.checked) {
					label = id + "_on";
				} else {
					label = id + "_off";
				}
			} else if (node.tagName == "SELECT") {
				label = $node.val();
			}
			var category = $node.closest("*[gaCategory]");
			var action = null;
			// if gaCategory specified
			if (category.length != 0) {
				category = category.attr("gaCategory");
				action = id;
			} else {
				category = id;
				action = "click";
			}
			
			if (label != null) {
				sendGA(['_trackEvent', category, action, label]);
			} else {
				sendGA(['_trackEvent', category, action]);
			}
		}
	}
}

// usage: sendGA(['_trackEvent', category, action, label]);
function sendGA(o, ls) {
	var gaSendingOffName = "ga_sending_off";
	var gaSendingOff = false;
	if (ls) {
		gaSendingOff = ls[gaSendingOffName];
	} else if (localStorage) {
		gaSendingOff = localStorage[gaSendingOffName];
	}
	chrome.extension.getBackgroundPage().console.log(o);
	if (!gaSendingOff) {
		// macbook users apparently getting _gaq undefined
		if (typeof _gaq != "undefined") {
			_gaq.push(o);
		}
	}		
}

function getPaypalLC() {
	var locale = pref("language", window.navigator.language);
	var lang = null;
	if (locale) {
		if (locale.match(/zh/i)) {
			lang = "CN"; 
		} else if (locale.match(/_GB/i)) {
			lang = "GB";
		} else if (locale.match(/ja/i)) {
			lang = "JP";
		} else {
			lang = locale.substring(0,2);
		}
		return lang;
	}
}

function isAsianLangauge() {
	var lang = pref("language", window.navigator.language);
	return /ja|zh|ko/.test(lang);
}

function loadCalendarJS(doc) {
	if (!doc) {
		doc = document;
	}
	var lang = pref("language", window.navigator.language).substring(0, 2);
	doc.write(unescape("%3Cscript src='./calendar/calendar-" + lang + ".js' type='text/javascript'%3E%3C/script%3E"));
}

function initCommon() {
	// Console...
	origConsoleLog = console.log;
	origConsoleWarn = console.warn;
	origConsoleDebug = console.debug;
	initConsole();

	//loadCalendarJS();

	if (typeof($) != "undefined") {
		$(document).ready(function() {
			// For some reason including scripts for popup window slows down popup window reaction time, so only found that settimeout would work
			if (document.location.href.match("popup.html")) {
				setTimeout(function() {
					initAnalytics();
				}, 1);
			} else {
				initAnalytics();
			}				
			initCalendarNames(dateFormat.i18n);
			initMessages();
		});
	}
}

function log(str, prefName) {
	if (pref(prefName)) {
		console.log(str);
	}
}

function getProtocol() {
	return pref("ssl2", true) ? "https" : "http";
}

function initOptions() {
	$("legend input").each(function(index) {
		// Show or hide options at startup
		var $fieldset = $(this).closest("fieldset");
		var $options = $fieldset.find(".subOptions");
		
		$fieldset.toggleClass("selected", this.checked);
		$options.toggle(this.checked);

		// Bind function to show/hide options
		$(this).change(function() {
			$fieldset.toggleClass("selected", this.checked);
			$options.slideToggle(this.checked);
		});
	});
}

function checkPermissions(checkbox, callback) {
	var origins = $(checkbox).attr("origins");
	chrome.permissions.contains({origins: [getMessage("origins_" + origins)]}, function(result) {
		$(checkbox).prop("checked", result)
	});
}

function initPrefAttributes() {
	$("select[pref], input[pref], textarea[pref], input[origins]").each(function(index) {
		var origins = $(this).attr("origins");
		var prefValue;
		if ($(this).attr("default")) {
			if ($(this).attr("default") == "true") {
				prefValue = pref($(this).attr("pref"), true);
			} else {
				prefValue = pref($(this).attr("pref"), $(this).attr("default"));
			}
		} else if (chrome.extension.getBackgroundPage().Settings.defaults[$(this).attr("pref")] != undefined) {
			prefValue = pref($(this).attr("pref"), chrome.extension.getBackgroundPage().Settings.defaults[$(this).attr("pref")]);
			//alert($(this).attr("id") + " " + chrome.extension.getBackgroundPage().Settings.defaults[$(this).attr("id")] + " pref: " + prefValue)
		} else {			
			if (getBrowserVersion() >= 16 && origins) {
				checkPermissions($(this), function(){});
			} else {
				prefValue = pref($(this).attr("pref"));
			}
		}
		if (this.tagName == "INPUT") {
			if ($(this).attr("type") == "checkbox") {
				if (origins) {
					$(this).change(function(event) {
						var checkbox = this;
						if (this.checked) {
							if (getBrowserVersion() < 16) {
								alert("You must first upgrade Chrome to the latest version!");
								checkbox.checked = false;
							} else {
								chrome.permissions.request({origins: [getMessage("origins_" + origins)]}, function(granted) {
									checkbox.checked = granted;
								});
							}
						} else {			
							chrome.permissions.remove({origins: [getMessage("origins_" + origins)]}, function(removed) {
								if (removed) {
									checkbox.checked = false;
								} else {
									// The permissions have not been removed (e.g., you tried to remove
									// required permissions).
									alert("error removing permission");
									checkbox.checked = true;
								}
							});
						}
					});
				} else {
					$(this).attr("checked", prefValue);
					$(this).change(function(event) {
						changePref(this, this.checked, event);
					});
				}
			} else if ($(this).attr("type") == "radio") {
				if ($(this).val() == prefValue) {
					$(this).attr("checked", "true");
				}				
				$(this).change(function(event) {
					changePref(this, $(this).val(), event);
				});
			} else if ($(this).attr("type") == "text") {
				$(this).keyup(function() {
					changePref(this, $(this).val(), event);
				});
			} else if ($(this).attr("type") == "range") {
				$(this).val(prefValue);
				$(this).change(function() {
					changePref(this, $(this).val(), event);
				});
			}
		} else if (this.tagName == "SELECT") {
			$(this).val(prefValue);
			$(this).change(function() {
				changePref(this, $(this).val(), event);
			});
		} else if (this.tagName == "TEXTAREA") {
			if (prefValue) {
				$(this).val(prefValue);
			}
			$(this).blur(function() {
				changePref(this, $(this).val(), event);
			});
		}
		
		$(this).on("click change", function(event) {
			if ($(this).attr("mustDonate") && !pref("donationClicked")) {
				event.preventDefault();
			}
		});
	});
}

function changePref(node, value, event) {
	if (!$(node).attr("mustDonate") || ($(node).attr("mustDonate") && donationClicked($(node).attr("pref")))) {
		chrome.extension.getBackgroundPage().Settings.store($(node).attr("pref"), value);
		//localStorage[$(node).attr("pref")] = value;
		return true;
	} else {
		// preventDefault() does not work on the "change" event, only the "click" event so revert checkbox state instead
		//event.preventDefault();		
		/*
		if (node.tagName == "INPUT") {
			node.checked = !node.checked;
		}
		*/
		return false;
	}	
}

//patch: for notification window to show tooltips
function SimulateToolTips() {
	var $tooltip = $("<div id='simulatedTooltip' style='background:lightyellow;color:black;box-shadow:4px 4px 10px #555;display:none;z-index:5;max-width:500px;position:absolute;border-radius:2px;border:1px solid #555;padding:1px;font-size:10px'/>");
	$("body").append($tooltip);
	var timer = null;
	var lastNodeHovered;
	
	var selector = "*[title]";
	var namespace = "simulateToolTips";
	
	$(selector).on("mousemove." + namespace, function(event) {
		if (timer) {
			clearTimeout(timer);
		}
		lastNodeHovered = $(this);
		timer = setTimeout(function() {
			var mouseX = event.pageX;
			var mouseY = event.pageY;
			
			// above top so display it below cursor
			if (mouseY < 16) {
				mouseY = 30;
			} else {
				mouseY -= 19;
			}

			if (lastNodeHovered.attr("title")) {
				$tooltip
					.html(lastNodeHovered.attr("title"))
					.css({left:mouseX-12, top:mouseY})
					.show();
			}
		}, 500);
		return false;
	}).on("mouseleave." + namespace, function() {
		clearTimeout(timer);
		$tooltip.hide();
	});

	SimulateToolTips.disable = function() {
		$(selector).off("mousemove." + namespace).off("mouseleave." + namespace);
		clearTimeout(timer);
		$tooltip.hide();
	}

	return SimulateToolTips;
}

function showTooltip(content) {
	$("#tooltip").html(content);
	var mouseX = event.pageX;
	var mouseY = event.pageY;
	$("#tooltip").css({left:mouseX+24, top:mouseY+8});
	$("#tooltip").show();
}

function initToolTips() {
	
	var $tooltip = $("<div id='tooltip' style='color:black;box-shadow:4px 4px 10px #555;display:none;z-index:5;max-width:500px;position:absolute;border-radius:5px;border:1px solid #555;background:lightyellow;padding:4px;font-size:100%'/>");
	$("body").append($tooltip);
	
	$(document).on("mousemove mouseleave", "*[mustDonate], *[msg], *[msgToolTip]", function(event) {
		// for labels mainly
		var msgName;
		
		if ($(this).attr("msg") && !$(this).attr("msgToolTip")) {
			msgName = $(this).attr("msg") + "ToolTip";
		} else {
			msgName = $(this).attr("msgToolTip");
		}
		if (event.type == 'mousemove') {
			var donateHTML = " <span style='font-weight:bold'>(" + getMessage("donationRequired") + ")</span>";
			if ((this.tagName == "INPUT" || this.tagName == "SELECT") && $(this).attr("mustDonate") == "true") {
				// for checkboxes mainly
				if (!pref("donationClicked")) {
					showTooltip(donateHTML);
				}
			} else {
				if (msgName) {
					var msgValue = getMessage(msgName);
					if (msgValue) {
						if (!pref("donationClicked") && ($(this).attr("mustDonate") || $(this).parent().find("input, select").first().attr("mustDonate"))) {
							showTooltip(msgValue + donateHTML);
						} else {
							showTooltip(msgValue);
						}						
					}
				}
			}
		} else if (event.type == 'mouseleave') {
			$("#tooltip").hide();				
		}
	});	
}

function initConsole() {
	if (pref("console_messages")) {
		/*
		 * was causing <exception> errors in latest chrome version
		chrome.extension.getBackgroundPage().console.log = console.log = origConsoleLog;
		chrome.extension.getBackgroundPage().console.warn = console.warn = origConsoleWarn;
		chrome.extension.getBackgroundPage().console.debug = console.debug = origConsoleDebug;
		*/
		console.log = origConsoleLog;
		console.warn = origConsoleWarn;
		console.debug = origConsoleDebug;
	} else {
		chrome.extension.getBackgroundPage().console.log = chrome.extension.getBackgroundPage().console.warn = chrome.extension.getBackgroundPage().console.debug = console.warn = console.info = console.log = function(msg){};
	}
}

function initCalendarNames(obj) {
	if (Calendar._DN) {
		for (var a=0; a<7; a++) {
			obj.dayNames[a] = Calendar._DN[a];
			var SDNLen = Calendar._SDN_len;
			if (Calendar._SDN) {
				obj.dayNamesShort[a] = Calendar._SDN[a];
			} else {
				if (!SDNLen) {
					SDNLen = 3;
				}
				obj.dayNamesShort[a] = Calendar._DN[a].substring(0, SDNLen);
			}
		}
		for (var a=0; a<12; a++) {
			if (Calendar._MN) {
				obj.monthNames[a] = Calendar._MN[a];
				var SMNLen = Calendar._SMN_len;
				if (Calendar._SMN) {
					obj.monthNamesShort[a] = Calendar._SMN[a];
				} else {
					if (!SMNLen) {
						SMNLen = 3;
					}
					obj.monthNamesShort[a] = Calendar._MN[a].substring(0, SMNLen);
				}
			}
		}
	}
}

function initMessages(node) {
	var selector;
	if (node) {
		selector = node;
	} else {
		selector = "*";
	}
	$(selector).each(function() {
		//var parentMsg = $(this);
		var attr = $(this).attr("msg");
		if (attr) {
			var msgArg1 = $(this).attr("msgArg1");
			if (msgArg1) {
				$(this).text(getMessage( $(this).attr("msg"), msgArg1 ));
			} else {
				// look for inner msg nodes to replace before...
				var innerMsg = $(this).find("*[msg]");
				if (innerMsg.exists()) {
					initMessages(innerMsg);
					var msgArgs = new Array();
					innerMsg.each(function(index, element) {
						msgArgs.push( $(this).get(0).outerHTML );
					});
					$(this).html(getMessage(attr, msgArgs));
				} else {
					$(this).text(getMessage(attr));
				}
			}
		}
		attr = $(this).attr("msgTitle");
		if (attr) {
			$(this).attr("title", getMessage(attr));
		}
		attr = $(this).attr("msgSrc");
		if (attr) {
			$(this).attr("src", getMessage(attr));
		}
		attr = $(this).attr("msgValue");
		if (attr) {
			$(this).attr("value", getMessage(attr));
		}
	});
}

function donationClicked(action, ls) {
	if (pref("donationClicked", null, ls)) {
		return true;
	} else {
		var url = "donate.html?action=" + action;
		/*
		try {
			// this was not working AND NOT returning an error??? bug in Canary
			chrome.tabs.create({url:url});
		} catch (e) {
			// Must be in a content_script or somewhere chrome.tabs.create cannot be called so send call to background.js
			chrome.extension.sendRequest({name: "openTab", url:url}, function(response) {
				}
			);
		}
		*/
		chrome.extension.sendRequest({command: "openTab", url:url});
		return false;
	}
}

function getChromeWindows(callback) {
	chrome.windows.getAll({}, function(windowList) {
		// keep only normal windows and not app windows like debugger etc.
		var normalWindows = new Array();
		for (var a=0; a<windowList.length; a++) {
			if (windowList[a].type == "normal") {
				normalWindows.push(windowList[a]);
			}
		}
		callback({windowList:windowList, normalWindows:normalWindows});
	});
}

// params: url or {url, urlToFind}
function createTab(params, callback) {	
	var url;
	
	// Determine if object passed as param
	if (params.url) {
		url = params.url;
	} else {
		url = params;
	}
	if (!callback) {
		callback = function() {};
	}
	getChromeWindows(function(windowsParams) {
		if (windowsParams.normalWindows.length == 0) { //isLiteVersion() &&
			//chrome.extension.getBackgroundPage().console.log("chrome.windows.create");
			console.log('create window')
			chrome.windows.create({url:url, focused:true}, function(window) {
				console.log("window details: ", window);
				chrome.windows.getAll({populate:true}, function(windowList) {
					console.log("winodw list: ", windowList);
					if (windowList) {
						for (var a=0; a<windowList.length; a++) {
							if (windowList[a].id == window.id) {
								console.log("found window: ", windowList);
								for (var b=0; b<windowList[a].tabs.length; b++) {
									if (windowList[a].tabs[b].url == url) {										
										// force focus window cause it doesn't awlays happen when creating window with url
										chrome.windows.update(windowList[a].id, {focused:true}, function() {
											chrome.extension.getBackgroundPage().console.log("force window found")
											chrome.tabs.update(windowList[a].tabs[b].id, {active:true}, callback);
										});
										break;
									}
								}
								break;
							}
						}
					}
				});
				/*
				chrome.windows.get(window.id, function(window) {
					console.log("window get: ", window);
				});
				*/
			});
		} else {
			//chrome.extension.getBackgroundPage().console.log("chrome.tabs.create");
			//chrome.tabs.create({url:url}, callback);
			selectOrCreateTab(params, callback);
		}		
	});
}

// params: url or {url, urlToFind}
// OLD: findUrlStr, urlToOpen
function selectOrCreateTab(params, callback) {
	var url;
	
	// Determine if object passed as param
	if (params.url) {
		url = params.url;
	} else {
		url = params;
	}
	
	if (params.urlToFind) {
		chrome.windows.getAll({populate:true}, function (windows) {
			for(var a=0; a<windows.length; a++) {
				var tabs = windows[a].tabs;
				for(var b=0; b<tabs.length; b++) {
					if (tabs[b].url.indexOf(params.urlToFind) != -1) {
						// window focused bug fixed yay!
						chrome.windows.update(windows[a].id, {focused:true}, function() {
							chrome.tabs.update(tabs[b].id, { active: true });
							callback({found:true, tab:tabs[b]});
						});
						return true;
					}
				}
			}
			createTabAndFocusWindow(url, function(response) {
				callback({found:false, tab:response.tab});
			});
			return false;
		});
	} else {
		createTabAndFocusWindow(url, function(response) {
			callback({found:false, tab:response.tab});
		});
	}
}

function createTabAndFocusWindow(url, callback) {
	chrome.tabs.create({url: url}, function(tab) {
		chrome.windows.update(tab.windowId, {focused:true}, function() {
			if (callback) {
				callback(tab);
			}
		});						
	});
}

function removeNode(id) {
	var o = document.getElementById(id);
	if (o) {
		o.parentNode.removeChild(o);
	}
}

function addCSS(id, css) {
	removeNode(id);
	var s = document.createElement('style');
	s.setAttribute('id', id);
	s.setAttribute('type', 'text/css');
	s.appendChild(document.createTextNode(css));
	(document.getElementsByTagName('head')[0] || document.documentElement).appendChild(s);
}

function pad(str, times, character) { 
	var s = str.toString();
	var pd = '';
	var ch = character ? character : ' ';
	if (times > s.length) { 
		for (var i=0; i < (times-s.length); i++) { 
			pd += ch; 
		}
	}
	return pd + str.toString();
}

function getBrowserVersion() {
	// Browser name = Chrome, Full version = 4.1.249.1064, Major version = 4, navigator.appName = Netscape, navigator.userAgent = Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.1.249.1064 Safari/532.5
	//																															  Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/533.4 (KHTML, like Gecko) Chrome/5.0.375.38 Safari/533.4
	var agent = navigator.userAgent;
	var offset = agent.indexOf("Chrome");
	var version = null;
	if (offset != -1) {
		version = agent.substring(offset+7);
		offset = version.indexOf(";");
		if (offset != -1) {
			version = version.substring(0, offset);
		}
		offset = version.indexOf(" ");
		if (offset != -1) {
			version = version.substring(0, offset);
		}
	}
	if (version) {
		return parseFloat(version);
	}
}

function toBool(str) {
	if ("false" === str || str == undefined) {
		return false;
	} else if ("true" === str) {
		return true;
	} else {
		return str;
	}
}

// This pref function is different*** we pass either just the param to localStorage[param] or the value of localStorage["example"]
function pref(param, defaultValue, ls) {
	var value;
	if (ls) {
		value = ls[param];
	} else {
		value = chrome.extension.getBackgroundPage().Settings.read(param);
		//value = localStorage[param];
	}
	if (defaultValue == undefined) {
		defaultValue = false;
	}
	return value == null ? defaultValue : toBool(value);
}

function getUrlValue(url, name, unescapeFlag) {
	if (url) {
	    var hash;
	    var hashes = url.slice(url.indexOf('?') + 1).split('&');
	    for(var i=0; i<hashes.length; i++) {
	        hash = hashes[i].split('=');
			if (hash[0] == name) {
				if (unescapeFlag) {
					return unescape(hash[1]);
				} else {
					return hash[1];
				}
			}
	    }
	    return null;
	}
}

function setUrlParam(url, param, value) {
	var params = url.split("&");
	for (var a=0; a<params.length; a++) {
		var idx = params[a].indexOf(param + "=");
		if (idx != -1) {
			var currentValue = params[a].substring(idx + param.length + 1);
			return url.replace(param + "=" + currentValue, param + "=" + value);
		}
	}
	if (url.indexOf("?") == -1) {
		url += "?";
	} else {
		url += "&";
	}
	return url + param + "=" + value;
	
	/*
	if (url.indexOf(param + "=") != -1) {
		//var regex = new RegExp(param + "=.*", "ig");
		//return url.replace(regex, param + "=" + value);
	} else {
		if (url.indexOf("?") == -1) {
			url += "?";
		} else {
			url += "&";
		}
		return url + param + "=" + value;
	}
	*/
}

function getCookie(c_name) {
	if (document.cookie.length>0) {
	  c_start=document.cookie.indexOf(c_name + "=");
	  if (c_start!=-1) {
	    c_start=c_start + c_name.length+1;
	    c_end=document.cookie.indexOf(";",c_start);
	    if (c_end==-1) c_end=document.cookie.length;
	    return unescape(document.cookie.substring(c_start,c_end));
	    }
	  }
	return "";
}

function exists(o) {
	if (o) {
		return true;
	} else {
		return false;	
	}	
}

function getExtensionIDFromURL(url) {
	//"chrome-extension://dlkpjianaefoochoggnjdmapfddblocd/options.html"
	return url.split("/")[2]; 
}

function getStatus(request, textStatus) {
	var status; // status/textStatus combos are: 201/success, 401/error, undefined/timeout
	try {
		status = request.status;
	} catch (e) {
		status = textStatus;
	}
	return status;
}

function setTodayOffsetInDays(days) {
	var offset = today();
	offset.setDate(offset.getDate()+parseInt(days));
	localStorage["today"] = offset;
}

function clearTodayOffset() {
	localStorage.removeItem("today");
}

function addToArray(str, ary) {
	for (var a=0; a<ary.length; a++) {
		if (ary[a] == str) {
			return false;
		}
	}
	ary.push(str);
	return true;
}

function removeFromArray(str, ary) {
	for (var a=0; a<ary.length; a++) {
		if (ary[a] == str) {
			ary.splice(a, 1);
			return true;
		}
	}
	return false;
}

function isInArray(str, ary) {
	for (var a=0; a<ary.length; a++) {
		if (isSameUrl(ary[a], str)) {
			return true;
		}
	}
	return false;
}

function isSameUrl(url1, url2) {
	return removeProtocol(url1) == removeProtocol(url2);
}

function removeProtocol(url) {
	if (url) {
		return url.replace(/https?:\/\//g, "");
	} else {
		return url;
	}
}

function findTag(str, name) {
	if (str) {
		var index = str.indexOf("<" + name + " ");
		if (index == -1) {
			index = str.indexOf("<" + name + ">");
		}
		if (index == -1) {
			return null;
		}
		var closingTag = "</" + name + ">";
		var index2 = str.indexOf(closingTag);
		return str.substring(index, index2 + closingTag.length);
	}
}

function isRockMelt() {
	return navigator.userAgent.match(/rockmelt/i);
}

function rotate(node, params) {
	// can't rotate <a> tags for some reason must be the image inside if so
	var rotationInterval;
	if (params && params.forever) {
		node.css({WebkitTransition: "all 10ms linear"});
		var degree = 0;
		rotationInterval = setInterval(function() {
	    	node.css({WebkitTransform: 'rotate(' + (degree+=2) + 'deg)'}); //scale(0.4) translateZ(0)
	    }, 2);
	} else {
		node.css({WebkitTransition: "all 1s ease-out"}); //all 1000ms linear
		node.css({WebkitTransform: "rotateZ(360deg)"}); //-webkit-transform: rotateZ(-360deg);
	}
	return rotationInterval;
}

function trimLineBreaks(str) {
	if (str) {
		str = str.replace(/^\n*/g, "");
		str = str.replace(/\n*$/g, "");
	}
	return str;
}

function cleanEmailSubject(subject) {
	if (subject) {
		subject = subject.replace(/^re: ?/i, "");
		subject = subject.replace(/^fwd: ?/i, "");
	}
	return subject;	
}

function getHost(url) {
	if (url) {
		var matches = url.match(/:\/\/([^\/?#]*)/);
		if (matches && matches.length >=2) {
			return matches[1];
		}
	}
}

function ellipsis(str, cutoffLength) {	
	if (str && str.length > cutoffLength) {
		str = str.substring(0, cutoffLength) + " ...";
	}
	return str;
}

if (document.location.href.match("chrome-extension://")) {
	if (chrome.extension.getBackgroundPage().wrappedDB.opened) {
		initCommon();
	}
}

//return 1st active tab
function getActiveTab(callback) {
	chrome.tabs.query({'active': true}, function(tabs) {
		if (tabs && tabs.length >= 1) {
			callback(tabs[0]);
		} else {
			callback();
		}
	});
}

function beautify(string) {
    return string.replace(/([+.,])$/, '').replace(/^([+.,])/, '');
}

/*
 * -----------------------------------------------------------------------------
 *  Function for filtering text from "bad" characters and preppare text
 *  for Google Text to Speech API
 * -----------------------------------------------------------------------------
*/	
function filterTextForGoogleSpeech(text) {
	var j = 0,
	str = [],
	tmpstr =[],
	maxlength = 90, // Max length of one sentence this is Google's fault :)
	badchars = ["+","#","@","-","<",">","\n","!","?",":","&",'"',"  ","。"],
	replaces = [" plus "," sharp "," at ","","","","",".",".","."," and "," "," ","."];

	for(var i in badchars) // replacing bad chars
	{
		text = text.split(badchars[i]).join(replaces[i]);		
	}

	str = text.split(/([.,!?:])/i); // this is where magic happens :) :)

	for(var i in str) //join and group sentences
	{
		if(tmpstr[j] === undefined)
		{
			tmpstr[j] = '';
		}

		if((tmpstr[j]+str[i]).length < maxlength)
		{
			tmpstr[j] = tmpstr[j]+str[i].split(' ').join('+');
		}
		else
		{
			tmpstr[j] = beautify(tmpstr[j]);

			if(str[i].length < maxlength)
			{
				j++;
				tmpstr[j]=beautify(str[i].split(' ').join('+'));
			}
			else
			{
				sstr = split(str[i],maxlength);
				for(x in sstr)
				{
					j++;
					tmpstr[j] = beautify(sstr[x]);
				}
			}
		}
	}
	return tmpstr.filter(String);
}

function daysElapsedSinceFirstInstalled() {
	return Math.abs(new Date(chrome.extension.getBackgroundPage().Settings.read("installDate")).diffInDays());
}

function isDomainEmail(email) {
	if (/@yahoo\.|@gmail\.|@mail\.|@comcast\.|@googlemail\.|@hotmail\./.test(email)) {
		return false;
	} else {
		return true;
	}
}

function ChromeTTS() {
	
	var chromeTTSMessages = new Array();
	var speaking = false;
	
	ChromeTTS.queue = function(msg, options, callback) {
		if (!options) {
			options = {};
		}
		
		if (!callback) {
			callback = function() {};
		}
		
		options.utterance = msg;
		chromeTTSMessages.push(options);
		play(callback);
	};
	
	ChromeTTS.stop = function() {
		chrome.tts.stop();
		chromeTTSMessages = new Array();
		speaking = false;
	};
	
	ChromeTTS.isSpeaking = function() {
		return speaking;
	}
	
	function play(callback) {
		if (!callback) {
			callback = function() {};
		}
		
		if (chromeTTSMessages.length) {
			chrome.tts.isSpeaking(function(speakingParam) {
				console.log(speaking + " _ " + speakingParam);
				if (!speaking && !speakingParam) {
					// decoded etity codes ie. &#39; is ' (apostrohpe)
					var ttsMessage = $("<div/>").html(chromeTTSMessages[0].utterance).text();
					
					var voiceParams = chrome.extension.getBackgroundPage().Settings.read("voice");
					
					var voiceName;
					var extensionID;
					// if specified use it instead of the default 
					if (chromeTTSMessages[0].voiceName) {
						voiceName = chromeTTSMessages[0].voiceName;
						extensionID = "";
					} else {
						voiceName = voiceParams.split("___")[0];
						extensionID = voiceParams.split("___")[1];
					}					

					console.log("speak: " + ttsMessage);
					
					speaking = true;
					
					chrome.tts.stop();
					
					setTimeout(function() {
						chrome.tts.speak(ttsMessage, {
							voiceName: voiceName,
							extensionId : extensionID,
							//enqueue : true,
							volume: pref("voiceSoundVolume") / 100,
							pitch: parseFloat(pref("pitch")),
							rate: parseFloat(pref("rate")),
							onEvent: function(event) {
								console.log('event: ' + event.type);			
								if (event.type == 'error' || event.type == 'end') {
									//setTimeout(function() {
										chromeTTSMessages.shift();
										speaking = false;
										play(callback);
									//}, 400);
								}
							}
						});
					}, 150);
				} else {
					console.log("already speaking, wait before retrying...");
					setTimeout(function() {
						play(callback);
					}, 1000);
				}
			});
		} else {
			callback();
		}
	}
}

function OAuthForDevices(tokenResponses) {
	
	var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth";
	var GOOGLE_TOKEN_URL = "https://accounts.google.com/o/oauth2/token";
	var GOOGLE_CLIENT_ID = "4435332643-0ct22brgc45teeljjpq6tp79kjucfkev.apps.googleusercontent.com";
	var GOOGLE_CLIENT_SECRET = "5wWor-2Qlu4W4SXFHEQU7I5R";
	var GOOGLE_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";
	var GOOGLE_SCOPE = "https://www.google.com/m8/feeds"; // for contacts

	// Need this because 'this' keyword will be out of scope within this.blah methods like callbacks etc.
	var that = this;
	
	this.tokenResponses = tokenResponses;
	if (!this.tokenResponses) {
		this.tokenResponses = new Array();
	}
	this.params = null;
	this.callback = null;
	
	// return array
	this.getUserEmails = function() {
		var userEmails = new Array();
		$.each(that.tokenResponses, function(index, tokenResponse) {
			userEmails.push(tokenResponse.userEmail);
		});
		return userEmails;
	}

	// return just the emailid
	this.getUserEmail = function(tokenResponse, callback) {
		// were using the contacts url because it's the only one we request permission to and it will give us the email id (so only fetch 1 result)
		// send token response since we don't have the userEmail
		sendOAuthRequest({tokenResponse:tokenResponse, url: "https://www.google.com/m8/feeds/contacts/default/thin", data:{alt:"json", "max-results":"1"}}, function(params) {			
			if (params.error) {
				console.error("failed: you might by re-trying to fetch the userEmail for the non default account")
				params.warning = "failed: you might by re-trying to fetch the userEmail for the non default account";
				callback(params);
			} else {
				var userEmail = params.data.feed.id.$t;
				params.userEmail = userEmail;
				callback(params);
			}
		});
	}

	function onTokenChangeWrapper(params) {
		// expires_in params is in seconds (i think)
		params.tokenResponse.expiryDate = new Date(nowInMillis() + (params.tokenResponse.expires_in * 1000));
		that.onTokenChange(params, that.tokenResponses);
	}	
	
	// params: changedToken, allTokens
	this.onTokenChange = function() {};
	
	this.openPermissionWindow = function() {
		window.open(GOOGLE_AUTH_URL + "?response_type=code&client_id=" + GOOGLE_CLIENT_ID + "&redirect_uri=" + GOOGLE_REDIRECT_URI + "&scope=" + encodeURIComponent(GOOGLE_SCOPE), 'oauth', 'toolbar=0,scrollbars=0,menubar=0,resizable=0,width=700,height=500');
	}
	
	this.setOnTokenChange = function(onTokenChange) {
		this.onTokenChange = onTokenChange;
	}
	
	this.generateURL = function(userEmail, url, callback) {
		var tokenResponse = that.findTokenResponse({userEmail:userEmail});
		if (tokenResponse) {
			if (isExpired(tokenResponse)) {
				console.log("is expired: " + tokenResponse.expiryDate.toString());
				console.log("all tokens: " + that.tokenResponses[0].expiryDate.toString());
				refreshToken(tokenResponse, function(params) {
					console.log("after refresh: " + tokenResponse.expiryDate.toString());
					console.log("alltokens after: " + that.tokenResponses[0].expiryDate.toString());
					if (!params.error) {
						params.generatedURL = setUrlParam(url, "access_token", params.tokenResponse.access_token);
					}
					callback(params);
				});
			} else {			
				callback({generatedURL:setUrlParam(url, "access_token", tokenResponse.access_token)});
			}
		} else {
			callback({error:"No tokenResponse found!"});
		}
	}
	
	function sendOAuthRequest(params, callback) {
		// must append the access token to every request
		if (params.tokenResponse) {
			params.data.access_token = params.tokenResponse.access_token;
		} else if (params.userEmail) {
			var tokenResponse = that.findTokenResponse(params);	
			params.data.access_token = tokenResponse.access_token;
		}
		
		console.log("sending request: " + params.userEmail);
		$.ajax({
			type: "GET",
			url: params.url,
			data: params.data,
			dataType: "json",
			timeout: 10000,
			complete: function(request, textStatus) {
				var status = getStatus(request, textStatus);
				if (status == 200) {
					var data = JSON.parse(request.responseText);
					callback({data:data});
				} else {
					console.error("error getting data", request);
					params.error = "error getting data: " + request;
					callback(params);
				}
			}
		});
	}
	
	function refreshToken(tokenResponse, callback) {
		// must refresh token
		console.log("refresh token: " + tokenResponse.userEmail + " " + now().toString());
		$.ajax({
			type: "POST",
			url: GOOGLE_TOKEN_URL,			
			data: {refresh_token:tokenResponse.refresh_token, client_id:GOOGLE_CLIENT_ID, client_secret:GOOGLE_CLIENT_SECRET, grant_type:"refresh_token"},
			dataType: "json",
			timeout: 5000,
			complete: function(request, textStatus) {
				var status = getStatus(request, textStatus);
				if (status == 200) {
					var refreshTokenResponse = JSON.parse(request.responseText);
					tokenResponse.access_token = refreshTokenResponse.access_token;
					tokenResponse.expires_in = refreshTokenResponse.expires_in;
					tokenResponse.token_type = refreshTokenResponse.token_type;					
					
					var callbackParams = {tokenResponse:tokenResponse};
					onTokenChangeWrapper(callbackParams);
					console.log("in refresh: " + tokenResponse.expiryDate.toString());
					callback(callbackParams);
				} else {
					console.error("error getting new token via refresh token: " + request.statusText);
					callback({error:"error getting new token via refresh token: " + request.statusText});
				}
			}
		});
	}
	
	// private isExpired
	function isExpired(tokenResponse) {
		return !tokenResponse.expiryDate || tokenResponse.expiryDate.isBefore(now());
	}

	// use current token or refresh it if expired, than return the callback
	this.initToken = function(userEmail, callback) {
		var tokenResponse = that.findTokenResponse({userEmail:userEmail});
		if (tokenResponse) {
			if (isExpired(tokenResponse)) {
				refreshToken(tokenResponse, function() {
					callback({tokenResponse:tokenResponse});
				});
			} else {
				callback({tokenResponse:tokenResponse});
			}
		} else {
			callback({"error": "no token for: " + userEmail + ": might have not have been granted access"});
		}
	}		
	
	this.send = function(params, callback) {
		
		// save all args in this sendrequet to call it back later
		that.params = params;
		that.callback = callback;
		
		var tokenResponse = that.findTokenResponse(params);		
		if (tokenResponse) {
			if (isExpired(tokenResponse)) {
				console.log("token expired: ", tokenResponse);
				refreshToken(tokenResponse, function() {
					sendOAuthRequest(params, callback);
				});
			} else {
				sendOAuthRequest(params, callback);
			}
		} else {
			console.warn("old never used code that.code here should be replaced with fetching the proper code by userEmail etc...")
			that.getAccessToken(that.code, function(params) {				
				if (params.tokenResponse) {
					sendOAuthRequest(that.params, that.callback);
				} else {
					that.callback(params);
				}
			});
		}
	}
	
	this.findTokenResponse = function(params) {
		for (var a=0; a<that.tokenResponses.length; a++) {
			if (that.tokenResponses[a].userEmail == params.userEmail) {
				return that.tokenResponses[a];
			}
		}
	}
	
	this.getAccessToken = function(code, callback) {
		if (!code) {
			//alert("authorization code param is required: comes from opening the google grant permission popup");
		}
		that.code = code;
		console.log("get access token: " + now().toString());
		$.ajax({
			type: "POST",
			url: GOOGLE_TOKEN_URL,
			data: {code:code, client_id:GOOGLE_CLIENT_ID, client_secret:GOOGLE_CLIENT_SECRET, redirect_uri:GOOGLE_REDIRECT_URI, grant_type:"authorization_code"},
			dataType: "json",
			timeout: 5000,
			complete: function(request, textStatus) {
				var status = getStatus(request, textStatus);
				if (status == 200) {
					var tokenResponse = JSON.parse(request.responseText);
					
					that.getUserEmail(tokenResponse, function(params) {
						if (params.userEmail) {
							// add this to response
							tokenResponse.userEmail = params.userEmail;
							
							var tokenResponseFromMemory = that.findTokenResponse(params);
							if (tokenResponseFromMemory) {
								// update if exists
								tokenResponseFromMemory = tokenResponse;
							} else {
								// add new token response
								that.tokenResponses.push(tokenResponse);
							}
							var callbackParams = {tokenResponse:tokenResponse};
							onTokenChangeWrapper(callbackParams);
							callback(callbackParams);
						} else {
							callback(params);
						}
					});
				} else {
					callback({error:request.statusText});
				}
			}
		});
	} 
}

function Tools() {
	
	// Usage: Tools.getManifest(function(manifest) { display(manifest.version) });
	var manifest;
	Tools.getManifest = function(callback) {
		if (manifest) {
			callback(manifest);
		} else {
			var xhr = new XMLHttpRequest();
			xhr.onload = function() {
				manifest = JSON.parse(xhr.responseText);
				callback(manifest);
			};
			xhr.open('GET', '/manifest.json', true);
			xhr.send(null);
		}
	}
	
	Tools.detectChromeVersion = function(callback) {
		$.getJSON("http://omahaproxy.appspot.com/all.json?callback=?", function(data) {
			var versionDetected;
			var stableDetected = false;
			for (var a=0; a<data.length; a++) {
				if (navigator.platform.toLowerCase().indexOf(data[a].os) != -1) {
					for (var b=0; b<data[a].versions.length; b++) {
						if (navigator.userAgent.indexOf(data[a].versions[b].prev_version) != -1 || navigator.userAgent.indexOf(data[a].versions[b].version) != -1) {
							// it's possible that the same version is for the same os is both beta and stable???
							versionDetected = data[a].versions[b];
							if (data[a].versions[b].channel == "stable") {
								stableDetected = true;
								callback(versionDetected);
								return;
							}
						}
					}
				}
			}

			callback(versionDetected);
			/*
			for (var a=0; a<data.length; a++) {
				for (var b=0; b<data[a].versions.length; b++) {
					if (navigator.userAgent.indexOf(data[a].versions[b].prev_version) != -1 || navigator.userAgent.indexOf(data[a].versions[b].version) != -1) {
						callback(data[a].versions[b]);
						return;
					}
				}
			}
			callback();
			*/
		});
	}
}

function Payments() {
	
	// internal only for now
	function callAjaxController(params) {
		$.ajax({
			type: "GET",
			url: "http://freeapps.com",
			headers: {"misc":location.href},
			data: params.data,
			dataType: "jsonp",
			jsonp: "jsoncallback",
			timeout: 4000,
			success: params.success,
			error: params.error						
		});
	}
	
	Payments.verifyPayment = function(itemID, emails, callback) {
		callAjaxController({
			data: {action:"verifyPayment", name:itemID, email:emails}, //bg.email
			success: function(data, textStatus, jqXHR) {
				callback(data);
			},
			error: function() {
				callback({error: "error thrown from controller"});
			}						
		});
	}

	Payments.processFeatures = function() {
		chrome.extension.getBackgroundPage().Settings.store("donationClicked", true);
		chrome.extension.sendRequest({command: "featuresProcessed"}, function(response) {});
	}
}
