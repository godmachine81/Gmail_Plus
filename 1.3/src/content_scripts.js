// nothing

if (window.frameElement && window.frameElement.id == "canvas_frame") {
	setTimeout(function() {
		//console.log("clicking: " + $(".T-I.J-J5-Ji.T-I-Js-IF.aaq.T-I-ax7.L3").length);
		//$(".T-I.J-J5-Ji.T-I-Js-IF.aaq.T-I-ax7.L3").mousedown();
		//setTimeout(function() {
			//$(".T-I.J-J5-Ji.T-I-Js-IF.aaq.T-I-ax7.L3").mouseup()
		//}, 100);
		
		console.log($(".amr").length);
		$(".amr").focus();

		console.log($(".nr.tMHS5d").length);
		$(".nr.tMHS5d").focus();
		
		$.event.trigger({ type : 'keypress', which : "r".charCodeAt(0) });

		//nr tMHS5d
	}, 6000);
}