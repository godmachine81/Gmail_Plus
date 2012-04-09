var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-18469762-21']);
// Usage: adding abc.html?ga=test in the params will remove all other params from the google analytics tracking
var gaParam = getUrlValue(document.location.href, "ga");
if (gaParam) {
	if (gaParam == "NOQUERY") {
		sendGA(['_trackPageview', document.location.pathname]);
	} else {
		sendGA(['_trackPageview', document.location.pathname + "?ga=" + gaParam]);
	}
} else {
	sendGA(['_trackPageview']);
}
/*
if (document.location.href.match("notification.html")) {
	_gaq.push(['_trackPageview', '/notification.html']);
} else if (document.location.href.match("addEvent.html")) {
	_gaq.push(['_trackPageview', '/addEvent.html']);
} else {
	_gaq.push(['_trackPageview']);
}
*/
(function() {
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = 'https://ssl.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();