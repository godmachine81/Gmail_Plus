/// <reference path="DB.js" />

var Settings = function() {

   var cache = {};
   var storeId = "settings";
   var prefix = "gc_";

   Settings.defaults = {
      "animateButtonIcon": true,
      "soundNotification": true,
      "voiceNotification": true,
      "voiceNotificationOnlyIfIdle": true,
      "hearSubject": true,
      "hearMessage": true,
      "desktopNotification": true,
      "poll": 15000,
      "dn_timeout": 15000,
      "sn_audio": "chime.ogg",
      "check_label": "",
      "open_label": "#inbox",
      "icon_set": "set1",
      "preview_setting": 2,
      "check_gmail_off": false,
      "hide_count": false,
      "showfull_read": true,
      "conversationView": true,
      "open_tabs": false,
      "archive_read": true,
      "voice": "native",
      "showStar": true,
      "showArchive": true,
      "showSpam": true,
      "showDelete": true,
      "showReply": false,
      "showOpen": true,
      "showMarkAsRead": true,
      "showMarkAsUnread": true,
      "buttons": "original",
      "showOptionsButton": true,
      "showLeftColumnWhenPreviewingEmail": true,
      "notificationSoundVolume": 100,
      "voiceSoundVolume": 100,
      "pitch": 1.0,
      "rate": 1.0,
      "spokenWordsLimit": "summary",
      "notificationWindowType": "standard",
      "replyingMarksAsRead": true,
      "fetchContactsInterval": 48,
      "voiceNotificationOnlyIfIdle": true,
      "voiceNotificationOnlyIfIdleInterval": 15
   };
   
   function loadFromDB(_settingsLoaded) {
      wrappedDB.readAllObjects(storeId,
	      function (setting) {
	         cache[setting.key] = setting.value;
	      }, _settingsLoaded
	  );
   }

   Settings.read = function (key) {
      if (cache[key] != null) {
         return cache[key];
      }

      if (this.defaults[key] != null) {
         return this.defaults[key];
      }

      return null;
   };

   Settings.store = function (key, value) {
      cache[key] = value;
      wrappedDB.putObject(storeId, key, value);
   };

   Settings.load = function (settingsLoaded) {
	   var DBNAME = "MCP_DB";
      wrappedDB.open(DBNAME, storeId, function () { loadFromDB(settingsLoaded); });
   };
}

Settings();