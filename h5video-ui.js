function H5Video(media, conf) {
	conf = conf || {};
	this.media = media; // <video|audio> DOM pointer
	this.audio = this.media.nodeName === 'AUDIO';
	this.width = conf.width || null;
	this.height = conf.height || null;
	this.duration = conf.duration || null;
	this.fps = conf.fps || 25;
	this.jump = conf.jump || 5;
	this.rounded = conf.rounded !== false;
	this.persist = conf.persist !== false && typeof localStorage !== 'undefined';

	this.disableContextMenu = conf.disableContextMenu !== false;
	this.disablePictureInPicture = conf.disablePictureInPicture !== false;
	this.disableKeyboard = conf.disableKeyboard === true;
	this.disableSeeking = conf.disableSeeking || false;

	this.chapters = conf.chapters || null;
	this.thumbstrip = null;
	var t = conf.thumbstrip;
	if(t && t.url && !this.audio) {
		this.thumbstrip	= {
			url: t.url,
			width: t.width,
			height: t.height,
			count: t.count,
			columns: t.columns,
			distance: t.distance
		};
	}

	this.mediaTracks = [];
	this.ccTracks = [];
	this.ccTrack = null;
	this.ccCue = null;
	this.ccVisible = false;

	this.container = null;
	this.layers = null;
	this.controls = null;
	
	this.error = null;
	this.binds = null;
	this.seekTime = null;
	this.seekPaused = null;
	this.awaiting = false;

	this.uiTimer = null;
	this.uiTimeout = 3000;

	this.shortcuts = {
		play: 32, // space
		fullscreen: 70, // f
		mute: 77, // m
		jumpBack: 37, // left arrow
		jumpForward: 39, // right arrow
		frameBack: 188, // , <
		frameForward: 190 // . >
	};

	if(H5Video.env === null) {
		H5Video.env = H5Video.detect();
	}
	
	H5Video.instances.push(this);
	this.init();
}

H5Video.instances = [];
H5Video.env = null;

H5Video.prototype = {

bind: function(bind) {
	var self = this;
	if(!this.binds) {
		this.binds = {
			durationchange: function() { self.updateMeta(); },
			loadedmetadata: function() { self.updateMeta(); },
			timeupdate: function() { self.updateTime(); self.updateProgress(); },
			pause: function() { self.updatePlayPause(); },
			play: function() { self.updatePlayPause(); },
			ended: function() { self.updatePlayPause(); },
			seeking: function () { self.updateSeeking(true); },
			waiting: function () { self.updateSeeking(true); },
			stalled: function () { self.updateSeeking(true); },
			loadstart: function () { self.uiLoading(true); },
			canplay: function () { self.uiLoading(false); },
			canplaythrough: function () { self.uiLoading(false); },
			seeked: function () { self.updateSeeking(false); self.updateProgress(); },
			playing: function () { self.updateSeeking(false); self.updateProgress(); },
			progress: function() { self.updateProgress(); },
			volumechange: function() { self.updateVolume(); },
			// abort: function(err) { self.uiError('ABORT '+err); },
			// ratechange: function() { },
			// emptied: function() { self.reset(); },
			error: function(err) { if(err.code && err.message) self.uiError(err.message); },
			fullscreenchange: function(e) { self.updateFullscreen(); },
			webkitbeginfullscreen: function(e) { self.updateFullscreen(); },
			webkitendfullscreen: function(e) { self.updateFullscreen(); }
		};
	}

	for(var k in this.binds) {
		if(k === 'fullscreenchange') {
			if(bind) document.addEventListener(k, this.binds[k]);
			else document.removeEventListener(k, this.binds[k]);
		} 
		if(bind) this.media.addEventListener(k, this.binds[k]);
		else this.media.removeEventListener(k, this.binds[k]);
	}
},
init: function() {
	this.container = $("<div class='h5v h5v-ui' tabindex='0'></div>");
	this.layers = $("<div class='h5v-layers'>"+
		"<div class='h5v-loading'></div>"+
		"<div class='h5v-cc'></div>"+
		"<div class='h5v-play'><div class='h5v-initial-play'></div></div>"+
	"</div>");
	this.controls = $("<div class='h5v-controls'>"+
		"<div class='h5v-time-float'><span><b>00:00</b></span></div>"+
		"<div class='h5v-timeline'>"+
			"<div class='h5v-rail'>"+
				"<div class='h5v-buffer'></div>"+
				"<div class='h5v-chapters'></div>"+
				"<div class='h5v-pos'><div class='h5v-handle'></div></div>"+
			"</div>"+
		"</div>"+
		"<div class='h5v-buttons'>"+
			"<div class='h5v-buttons-left'>"+
				"<button class='h5v-play'></button>"+
				"<span class='h5v-time'>"+
					"<span class='h5v-current'>00:00</span>"+
					" / "+
					"<span class='h5v-duration'>00:00</span>"+
				"</span>"+
				"<button class='h5v-cc'></button>"+
			"</div>"+
			"<div class='h5v-buttons-right'>"+
				"<button class='h5v-mute'></button>"+
				"<div class='h5v-volume'>"+
					"<div class='h5v-rail'><div class='h5v-pos'><div class='h5v-handle'></div></div></div>"+
				"</div>"+
				"<button class='h5v-fs'></button>"+
			"</div>"+
		"</div>"+
	"</div>");

	if(this.thumbstrip && !this.audio) {
		var t = this.thumbstrip, w = t.columns * t.width, h = Math.ceil(t.count / t.columns) * t.height;
		var e = $("<div class='h5v-thumbstrip'></div>").css({
			width: t.width,
			height: t.height,
			backgroundImage: 'url("'+t.url+'")',
			backgroundSize: w+'px '+h+'px',
			backgroundPosition: '0 0'
		});
		$('.h5v-time-float span', this.controls).prepend(e);
	}
	
	var env = H5Video.env;
	this.container
		.toggleClass('h5v-audio', this.audio)
		.toggleClass('h5v-rounded', this.rounded)
		.toggleClass('h5v-android', env.android)
		.toggleClass('h5v-ios', env.ios)
		.toggleClass('h5v-iphone', env.iphone)
		.toggleClass('h5v-ipad', env.ipad);
	
	this.container = $(this.media).wrap(this.container).parent();
	this.container.append(this.layers).append(this.controls);
	this.updateMeta();
	this.updateFullscreen();
	this.updateMediaTracks();
	this.updateCcTracks();
	this.store();
	this.updateVolume();
	this.updateChapters();
	this.bindUI();
	this.bind(true);
	this.showUI(true);
	if(this.mediaTracks.length === 0) {
		this.uiError('Cannot Play Media');
	}
	this.autosize(true);
},
store: function(key) {
	if(this.persisting) return;
	var self = this, s = localStorage;
	if(key === 'volume') {
		s['h5v-volume'] = this.media.volume;
	} else if(key === 'cc') {
		s['h5v-cc'] = this.ccTrack ? 'cc' : '';
	} else {
		if(s['h5v-volume'] > 0) {
			this.media.volume = s['h5v-volume']*1;
		}
		if(s['h5v-cc'] === 'cc') {
			this.loadCcTrack(null, function(track) {
				self.ccTrack = track;
				self.ccCue = null;
				self.updateCc();
			});
		}
	}
},
autosize: function(set) {
	if(this.width>0 && this.height>0 && !this.audio) {
		$(this.media).css({height: set ? 100*(this.height / this.width) + '%' : ''});
	}
},
updateChapters: function() {
	var p = $('.h5v-chapters', this.controls);
	p.empty();
	if(this.chapters && this.duration) {
		for(var i=0; i<this.chapters.length; i++) {
			var c = this.chapters[i],
				e = $('<b></b>').data('time', c.time).css('left', 100*c.time / this.duration + '%');
			p.append(e);
		}
	}
},
bindUI: function() {
	var self = this, env = H5Video.env;
	
	this.media.controls = false;
	this.media.playsInline = true;
	
	if(this.disablePictureInPicture && typeof this.media.disablePictureInPicture !== 'undefined') {
		this.media.disablePictureInPicture = true;
	}
	
	if(this.disableContextMenu) {
		this.container.on('contextmenu', function(e) {
			e.preventDefault();
		});
	}
	
	if(!this.audio) {
		var fs = function(e) {
			e.preventDefault();
			self.toggleFullscreen();
		};
		$('.h5v-fs', this.controls).on('click', fs);
		$('.h5v-play', this.layers).on('dblclick', fs);
	}
	
	$('.h5v-play', this.container).on('click', function(e) {
		e.preventDefault();
		self.uiPlayPause();
	});

	if(env.mobile) {
		this.controls.on('click', function() { self.showUI(true); });
	} else {
		this.container
			.on('mousemove', function() { self.showUI(true); })
			.on('mouseleave', function() { self.showUI(false); })
			.on('keydown', function(e) { self.handleShortcuts(e); })
			.on('mousedown', function() { self.focus(); });
	}
	
	this.bindTimeline();
	
	var volume = $('.h5v-volume', this.controls);
	if(env.mobile) {
		volume.hide();
	} else {
		var adjvol = function(e) {
			if($(this).is(volume)) {
				self.media.volume = H5Video.normalize(e, $(this));
				self.updateVolume();
				if(e.type === 'dragstart') $(this).addClass('h5v-dragging');
				else if(e.type === 'dragstop') $(this).removeClass('h5v-dragging');
			}
		};
		volume.on('click mousedown', adjvol).draggable({axis:'x', helper:'none', drag:adjvol, stop:adjvol});
	}

	$('.h5v-mute', this.controls).on('click', function(e) {
		e.preventDefault();
		self.media.muted = !self.media.muted;
		self.updateVolume();
	});

	$('.h5v-cc', this.controls).on('click', function(e) {
		e.preventDefault();
		if(self.ccTrack) {
			self.ccTrack = null;
			self.updateCc();
			self.store('cc');
		} else {
			self.loadCcTrack(null, function(track) {
				self.ccTrack = track;
				self.ccCue = null;
				self.updateCc();
				self.store('cc');
			});
		}
	});
},
bindTimeline: function() {
	var self = this, mobile = H5Video.env.mobile;
	var seek = function(e) {
		if($(this).is(timeline)) {
			self.seekPause();
			self.seek(self.duration * H5Video.normalize(e, timeline));
			timeleave();
			timeline.removeClass('h5v-dragging');
		}
	};
	var seekmove = function(e) {
		if($(this).is(timeline)) {
			self.seekTime = self.duration * H5Video.normalize(e, timeline);
			self.seekPause();
			self.updateTime();
			timeline.addClass('h5v-dragging');
		}
	};
	var timefloat = $('.h5v-time-float', timeline), timewidth = 0, chapterwidth = 0;
	var timemove = function(e) {
		if($(this).is(timeline)) {
			e.preventDefault();
			var n = H5Video.normalize(e, timeline);
			var width = timeline.width(), pos = n * width, tm = self.duration * n;
			var t = self.thumbstrip, ch = self.chapters;
			if(t) {
				var cell = Math.min(t.count-1, Math.floor(tm / t.distance)),
					y = -t.height * Math.floor(cell / t.columns),
					x = -t.width * (cell % t.columns),
					tstrip = $('.h5v-thumbstrip', timefloat).css({'background-position': x + 'px ' + y + 'px'});
				pos = Math.max(t.width/2, Math.min(width - t.width/2, pos));
				if(ch) {
					if(!chapterwidth) chapterwidth = $('.h5v-chapters b', timeline).first().width();
					var chhtml = '', dur = 0.5 * self.duration * chapterwidth / width;
					for(var i=0; i<ch.length; i++) {
						if(ch[i].time - dur <= tm && tm <= ch[i].time + dur) {
							chhtml = '<i>' + ch[i].title + '</i>';
							break;
						}
					}
					tstrip.html(chhtml);
				}
			} else {
				if(!timewidth) timewidth = timefloat.width();
				pos = Math.max(timewidth/2, Math.min(width - timewidth/2, pos));
			}
			timefloat.addClass('h5v-visible').css({left:pos}).find('b').html(H5Video.formatTime(tm));
		}
	};
	var timeleave = function() {
		timefloat.removeClass('h5v-visible');
	};
	var timeline = $('.h5v-timeline', this.controls);
	if(mobile) {
		timeline.on('touchmove', timemove).on('touchend', timeleave);
	} else {
		timeline.on('mousemove', timemove).on('mouseleave', timeleave);
	}
	if(!this.disableSeeking) {
		timeline.on('click', seek);
		if(mobile) {
			timeline.on('touchstart touchmove', seekmove).on('touchend', seek);
		} else {
			timeline.on('mousedown', seekmove)
				.draggable({axis:'x', helper:'none', drag:seekmove,	stop:seek});
		}
	}
},
showUI: function(inside) {
	if(this.uiTimer) {
		clearTimeout(this.uiTimer);
		this.uiTimer = null;
	}
	this.container.addClass('h5v-ui');
	this.controls.show();
	this.updateFullscreen();
	if(!this.media.paused && !this.error && !this.audio) {
		var self = this;
		this.uiTimer = setTimeout(function() {
			self.container.removeClass('h5v-ui');
			self.updateFullscreen();
			this.uiTimer = setTimeout(function() {
				this.uiTimer = null;
				self.controls.hide();
			}, 250);
		}, inside ? this.uiTimeout : 250);
	}
},
updateMeta: function() {
	if(this.media.duration) this.duration = this.media.duration;
	if(this.media.videoWidth) this.width = this.media.videoWidth;
	if(this.media.videoHeight) {
		this.height = this.media.videoHeight;
		this.autosize(false);
	}
	$('.h5v-duration', this.controls).text(H5Video.formatTime(this.duration || 0));
},
updateMediaTracks: function() {
	var self = this;
	$('source', this.media).each(function() {
		var t = $(this);
		self.mediaTracks.push({
			default: t.get(0).hasAttribute('default'),
			src: t.attr('src'),
			type: t.attr('type')
		});
	});
},
updateCcTracks: function() {
	this.ccTracks = [];
	var self = this;
	$('track[srclang][kind=subtitles]', this.media).each(function() {
		var t = $(this);
		self.ccTracks.push({
			default: t.get(0).hasAttribute('default'),
			src: t.attr('src'),
			lang: t.attr('srclang'),
			label: t.attr('label'),
			parsed: null
		});
	});
	self.updateCc();
},
updateCc: function() {
	var cc = $('.h5v-cc', this.controls);
	if(this.ccTracks.length > 0) {
		cc.show();
		cc.toggleClass('h5v-cc-active', this.ccTrack !== null);
		this.updateCues();
	}
	else cc.hide();
},
loadCcTrack: function(lang, onLoad) {
	var track = null;
	for(var i=0; i<this.ccTracks.length; i++) {
		if(!lang || lang === this.ccTracks[i].lang) {
			track = this.ccTracks[i];
			break;
		}
	}
	if(track) {
		if(track.cues) {
			onLoad && onLoad(track);
		} else {
			$.ajax({url:track.src, cache:true}).done(function(text) {
				track.cues = H5Video.parseSrt(text);
				onLoad && onLoad(track);
			});
		}
		return true;
	}
	return false;
},
updateCues: function() {
	if(this.ccTrack && this.ccTrack.cues) {
		var tm = this.media.currentTime;
		var i = this.ccCue, cues = this.ccTrack.cues;
		if(i !== null) {
			if(cues[i].start <= tm && tm <= cues[i].end) return;
			if(cues[i].length > i+1) {
				if(tm < cues[i+1].start) {
					return this.showCue(null);
				}
				if(cues[i+1].start <= tm && tm <= cues[i+1].end) {
					this.ccCue = i+1;
					return this.showCue(this.ccCue);
				}
			}
		}
		i = this.findCueIndex(tm);
		if(i >= 0) {
			this.showCue(i);
		} else {
			this.ccCue = null;
			this.showCue(null);
		}
	} else {
		this.ccCue = null;
		this.showCue(null);
	}
},
showCue: function(i) {
	if(i === null) {
		if(this.ccVisible) {
			this.ccVisible = false;
			$('.h5v-cc', this.layers).empty();
		}
	} else {
		this.ccVisible = true;
		var cue = $("<div class='h5v-cc-cue'></div>").html(this.ccTrack.cues[i].text).attr({index:i});
		$('.h5v-cc', this.layers).empty().append(cue);
	}
},
findCueIndex: function(tm) {
	var cues = this.ccTrack.cues;
	for(var i=0; i<cues.length; i++) {
		if(cues[i].start <= tm && tm <= cues[i].end) return i;
	}
	return -1;
},
updateTime: function() {
	var tm = (this.seekTime !== null) ? this.seekTime : this.media.currentTime;
	$('.h5v-current', this.controls).text(H5Video.formatTime(tm));
	if(this.duration) {
		$('.h5v-timeline .h5v-pos', this.controls).css({width: Math.round(1000*tm/this.duration)/10 + '%'});
		this.updateCues();
	}
},
getCurrentTime: function() {
	return this.media.currentTime;
},
setCurrentTime: function(tm) {
	this.media.currentTime = tm;
},
play: function() {
	if(!this.awaiting && this.media.paused) {
		var p = this.media.play(), self = this;
		this.awaiting = true;
		if(p) p.then(function(){ self.awaiting = false; }).catch(function() {});
		else this.awaiting = false;
	}
},
pause: function() {
	if(!this.awaiting && !this.media.paused) {
		var p = this.media.pause(), self = this;
		this.awaiting = true;
		if(p) p.then(function(){ self.awaiting = false; }).catch(function() {});
		else this.awaiting = false;
	}
},
seek: function(tm) {
	this.media.currentTime = tm;
	this.updateTime();
	this.ccCue = null;
	this.showCue(null);
},
seekPause: function() {
	if(this.seekPaused === null) {
		this.seekPaused = this.media.paused;
		if(!this.media.paused) {
			this.media.pause();
			this.updatePlayPause();
		}
	}
},
updateProgress: function() {
	if(this.duration > 0) {
		var max=0, ranges=this.media.buffered;
		if(ranges && ranges.length > 0) {
			max = ranges.end(ranges.length - 1);
			$('.h5v-timeline .h5v-buffer', this.controls).css({width: Math.round(1000*max/this.duration)/10 + '%'});
		}
	}
},
updatePlayPause: function() {
	$('.h5v-initial-play', this.layers).remove();
	$('.h5v-play', this.controls).toggleClass('h5v-pause', !this.media.paused);
	this.showUI(true);
},
updateVolume: function() {
	var m = $('.h5v-mute', this.controls), v = $('.h5v-volume .h5v-pos', this.controls);
	if(this.media.muted) {
		m.addClass('h5v-muted');
		v.css({width: '0'});
	} else {
		this.store('volume');
		m.removeClass('h5v-muted');
		v.css({width: Math.round(100*this.media.volume) + '%'});
	}
},
updateSeeking: function(seeking) {
	if(!seeking) {
		this.seekTime = null;
		this.seekPaused = null;
	} else if(this.seekPaused === false) {
		this.media.play();
	}
	this.uiLoading(seeking);
},
uiLoading: function(loading) {
	$('.h5v-timeline .h5v-pos', this.controls).toggleClass('h5v-buffering', loading);
//	$('.h5v-loading', this.layers).html(loading ? "<div class='h5v-loader'><b></b><b></b><b></b><b></b></div>" : '');
},
focus: function() {
	if(!H5Video.env.mobile) this.container.focus();
},
isFullscreen: function() {
	var d = document;
	return !!(d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreen);
},
enterFullscreen: function() {
	var c = this.container.get(0), handled = true, self = this;
	if(c.requestFullscreen) c.requestFullscreen();
	else if(c.webkitRequestFullscreen) c.webkitRequestFullscreen();
	else if(c.msRequestFullscreen) c.msRequestFullscreen();
	else if(this.media.webkitEnterFullscreen) this.media.webkitEnterFullscreen();
	else handled = false;
	if(handled) {
		setTimeout(function() { self.updateFullscreen(); }, 0);
	}
},
exitFullscreen: function() {
	var d = document, handled = true, self = this;
	if(d.exitFullscreen) d.exitFullscreen();
	else if(d.webkitExitFullscreen) d.webkitExitFullscreen();
	else if(d.msExitFullscreen) d.msExitFullscreen();
	else handled = false;
	if(handled) {
		setTimeout(function() { self.updateFullscreen(); }, 0);
	}
},
toggleFullscreen: function() {
	if(this.isFullscreen()) this.exitFullscreen();
	else this.enterFullscreen();
},
updateFullscreen: function() {
	var fs = this.isFullscreen();
	this.container.toggleClass('h5v-fullscreen', fs);
},
uiError: function(text) {
	if(text) {
		this.error = text;
		var err = $("<div class='h5v-error'></div>").text(text);
		$('.h5v-play', this.layers).empty().append(err);
	}
},
uiPlayPause: function() {
	this.focus();
	if(this.error) return;
	var ovr = $('.h5v-layers .h5v-play', this.container);
	if(this.media.paused) {
		this.media.play();
		ovr.html("<div class='h5v-playpause-play h5v-fade'></div>");
	} else {
		this.media.pause();
		ovr.html("<div class='h5v-playpause-pause h5v-fade'></div>");
	}
},
uiJump: function(d) {
	if(this.disableSeeking) return;
	var ovr = $('.h5v-layers .h5v-play', this.container);
	if(d === this.jump) {
		ovr.html("<div class='h5v-jump-forward h5v-fade'></div>");
	} else if(d === -this.jump) {
		ovr.html("<div class='h5v-jump-back h5v-fade'></div>");
	}
	this.seekPause();
	seek = Math.min(this.media.duration, Math.max(0, this.media.currentTime + d));
	this.seek(seek);
},
handleShortcuts: function(e) {
	if(this.disableKeyboard) return;
	var handled = true, s = this.shortcuts, d = 0;
	switch(e.which) {
		case s.play: this.uiPlayPause(); break;
		case s.mute: this.media.muted = !this.media.muted; break;
		case s.fullscreen: if(!this.audio) this.toggleFullscreen(); break;
		case s.jumpBack: d = -this.jump; break;
		case s.jumpForward: d = this.jump; break;
		case s.frameBack: d = -1/this.fps; break;
		case s.frameForward: d = 1/this.fps; break;
		default: handled = false;
	}

	if(handled) {
		if(d) this.uiJump(d);
		e.preventDefault();
	}
},
destroy: function() {
	$('.ui-draggable', this.controls).draggable('destroy');
	if(this.uiTimer) {
		clearTimeout(this.uiTimer);
		this.uiTimer = null;
	}
	this.bind(false);
	this.layers.remove();
	this.controls.remove();
	$(this.media).unwrap();
	this.media.controls = true;
	for(var i=0; i<H5Video.instances.length; i++) {
		if(H5Video.instances[i] === this) {
			H5Video.instances.splice(i, 1);
			break;
		}
	}
}
};

H5Video.gc = function() {
	for(var i=0; i<H5Video.instances.length; i++) {
		if(!$(document).has(H5Video.instances[i].media).length > 0) {
			H5Video.instances[i--].destroy();
		}
	}
};

H5Video.findInstance = function(media) {
	for(var i=0; i<H5Video.instances.length; i++) {
		if(H5Video.instances[i].media === media) return i;
	}
	return -1;
};

H5Video.parseSrt = function(data) {
	data = data.replace(/\r/g, '');
	data = data.split(/(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g);
	data.shift();

	var items = [];
	for (var i = 0; i < data.length; i += 4) {
		var s = data[i + 1].trim(), e = data[i + 2].trim();
		items.push({
			id: data[i].trim(),
			startTime: s,
			endTime: e,
			start: H5Video.parseTime(s),
			end: H5Video.parseTime(e),
			text: data[i + 3].trim()
		});
	}

	return items;
};

H5Video.parseTime = function(val) {
	var regex = /(\d+):(\d{2}):(\d{2}),(\d{3})/,
		parts = regex.exec(val),
		tm = 0;
	if(parts) {
		for(var i = 1; i < 5; i++) {
			parts[i] = parseInt(parts[i], 10);
			if(isNaN(parts[i])) parts[i] = 0;
		}
		tm = 3600*parts[1] + 60*parts[2] + parts[3] + parts[4]/1000;
	}
	return tm;
};
	
H5Video.createFromNode = function(node, config) {
	var media = node.get ? node.get(0) : node;
	if(!media) return null;
	for(var i=0; i<H5Video.instances.length; i++) {
		if(H5Video.instances[i].media === media) {
			return H5Video.instances[i];
		}
	}
	return new H5Video(media, $.extend({}, node.data('settings'), config));
};

H5Video.pauseAll = function() {
	for(var i=0; i<H5Video.instances.length; i++) {
		H5Video.instances[i].media.pause();
	}
};

H5Video.normalize = function(evt, node) {
	var e = evt.originalEvent,
		pageX = e.pageX,
		touches = e.changedTouches || e.touches,
		w = node.width();
	if(touches && touches.length) {
		pageX = touches[0].pageX;
	}
	var x = pageX - node.offset().left;
	return Math.max(0, Math.min(1, x/w));
};

H5Video.formatTime = function(sec) {
	var	m = Math.floor(sec/60),
		s = Math.floor(sec) % 60;
	return (m>9?m:'0'+m) + ':' +(s>9?s:'0'+s);
};

H5Video.detect = function() {
	var ua = navigator.userAgent, platform = navigator.platform, d = document;
	var touch = ('ontouchstart' in window || 'ontouchstart' in d);
	var multitouch = touch && navigator.maxTouchPoints > 1;
	var android = !!ua.match(/android/i);
	var ipad = (!!ua.match(/iPad/) && touch) || (ua.indexOf('Mac') >= 0 && multitouch); // iPad desktop "Mac"
	var iphone = (!!ua.match(/iPhone|iPod/) && touch);
	var ios = iphone || ipad;
	var v = d.createElement('video');
	return {
		platform: platform,
		ios: ios,
		iphone: iphone,
		ipad: ipad,
		android: android,
		mobile: (android || ios),
		touch: touch,
		multitouch: multitouch,
		fullscreen: !!(v && (v.requestFullscreen || v.webkitRequestFullscreen || v.msRequestFullscreen || v.webkitEnterFullscreen)),
		svg: (!!d.createElementNS && !!d.createElementNS('http://www.w3.org/2000/svg','svg').createSVGRect)
	};
};

$.fn.video = function(config) {
	return $(this).each(function() {
		if(config === 'destroy') {
			var i = H5Video.findInstance($(this).get(0));
			if(i >= 0) H5Video.instances[i].destroy();
		} else {
			H5Video.createFromNode($(this));
		}
	});
};
