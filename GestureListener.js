
/* PointerGestures v0.3
 * A Javascript gesture libaray 
 * https://github.com/aerik/PointerGestures.git
 * Copyright (c) 2015 Aerik Sylvan; Released under the MIT License 
 * 
 */

var GestureListener = function (targetElement) {
    var recentPointers = {};//set on first touch of pointer, updated on gesture, reset on pointer end
    var curPointers = {};//always holds most recent pointers, but reset on pointer end
    var busy = false;
    var lastGesture = null;
    var lastEvent = null;
    var lastPtrId = 0;//seed for ids for touches
    var self = this;
    var button = null;
    this.onGesture = null;
    this.lastTrigger = null;

    this.getPointers = function () {
        return copyPointers(curPointers);
    }

    var dispatchGesture = function (gesture) {
        if (gesture == null) return;
        if (self.onGesture != null) {
            self.onGesture(gesture);
        } else {
            var gEvent = createEvent("gesture", gesture, true);
            if (gEvent) targetElement.dispatchEvent(gEvent);
        }
    }

    var createUIEvent = false;
    // Can we create events using the MouseEvent constructor? If so, gravy
    try {
        i = new UIEvent('test');

        createUIEvent = function (type, bubbles) {
            return new UIEvent(type, { view: window, bubbles: bubbles });
        };

        // otherwise we need to do things oldschool
    } catch (err) {
        if (document.createEvent) {
            createUIEvent = function (type, bubbles) {
                var uiEvent = document.createEvent('UIEvents');
                uiEvent.initUIEvent(type, bubbles, true, window, 0);

                return uiEvent;
            };
        }
    }

    if (!createUIEvent) {
        throw new Error('Cannot create events. You may be using an unsupported browser.');
    }

    var createEvent = function (type, params, noBubble) {
        var uiEvent, i;

        uiEvent = createUIEvent(type, !noBubble);
        //delete original pageX and Y so they can be set by Params
        delete uiEvent.pageX;
        delete uiEvent.pageY;

        for (var p in params) {
            Object.defineProperty(uiEvent, p, {
                value: params[p],
                writable: false
            });
        }
        return uiEvent;
    };



    copyPointers = function (pointerList) {
        var p1 = [];
        //use the most recent pointer states
        //they should have distance and speed properties
        for (var p in pointerList) {
            p1.push(pointerList[p]);
        }
        return p1;
    }
    /************* TODO: tap, double tap, long press ***************************/

    var createGestureEvent = function (triggerType, isLast) {
        /*
			* tap - one pointer, little movement, short duration, end of event only
			* hold - one pointer, little movement, long duration, end of event only
			* pan - one pointer, slow movement
			* swipe - one pointer, fast movement
			* pinch - two pointers, move towards or away from each other
			*/
        var ps = copyPointers(curPointers);
        if (ps.length < 1) {
            console.log("no pointers " + triggerType + " " + isLast.toString());
            return null;
        }
        var pt = ps[0];
        if (typeof isLast == "undefined") var isLast = false;
        var ptDistSq = Math.abs(pt.distX) + Math.abs(pt.distY);
        var ptTotalDist = ptDistSq;
        if (pt.totalX) ptTotalDist = pt.totalX + pt.totalY;
        var params = {
            target: targetElement,
            name: null,
            pointers: ps,
            ended: isLast,
            pageX: pt.pageX,
            pageY: pt.pageY
        };
        //only one pointer
        if (ps.length == 1) {
            if (ptTotalDist < 10 && (lastGesture == null)) {
                if (pt.ended) {
                    if (pt.totalTime < 200) {
                        params.name = "tap";
                    } else {
                        if (pt.totalTime < 2000) {
                            params.name = "hold";
                        }
                    }
                }//else do nothing - wait to see what happens
            } else if(lastGesture == null || lastGesture == "pan"){  //pan, swipe
                params.moveX = pt.distX;
                params.moveY = pt.distY;
                var totalSpeed = ptDistSq / pt.totalTime;
                if (ptDistSq < 30 || totalSpeed < 2) {
                    params.name = "pan";
                } else {
                    if (isLast) {
                        params.name = "swipe";
                    }
                }
            }
        } else if (ps.length == 2) { //two pointers
            var p2 = ps[1];//second pointer
            if (recentPointers[pt.pointerId] && recentPointers[p2.pointerId]) {

            }
        }//could do 3 finger actions here
        //only fire if we have data
        //if (params.name || isLast) {
            if (params.name == "swipe") {
                //reset - stop gesture after swipe
                curPointers = {};
                lastGesture = null;
            }
            params.button = button;
            lastGesture = params.name;
            //var gEvent = createEvent("gesture", params, true);
            var gEvent = params;
            lastEvent = gEvent;
            recentPointers = {};
            if (!isLast) {
                for (var lp in curPointers) {
                    recentPointers[lp] = curPointers[lp];
                }
            }
            return gEvent;
        //}
        return null;
    }

    var getDist = function (p1, p2) {
        var xdelta = p2.pageX - p1.pageX;
        var ydelta = p2.pageY - p1.pageY;
        var curDist = Math.sqrt((xdelta * xdelta) + (ydelta * ydelta));
        return curDist;
    }

    var copyEvent = function (e) {
        var copy = {};
        var params = ["target", "pageX", "pageY","pointerId", "identifier", "button", "targetTouches", "changedTouches", "pointerType","type"];
        for (var i = 0; i < params.length; i++) {
            if (typeof e[params[i]] != "undefined") {
                copy[params[i]] = e[params[i]];
            }
        }
        return copy;
    }

    var updatePointerEvent = function (e, last) {
        var dur = e.eventTime - last.eventTime;
        var totalTime = dur;
        if(last.totalTime) totalTime += last.totalTime;
        var distX = e.pageX - last.pageX;
        var distY = e.pageY - last.pageY;
        var totalX = Math.abs(distX);
        var totalY = Math.abs(distY);
        var dir = Math.round(Math.atan2(distY, distX) * (180 / Math.PI));
        if (dir < 0) dir = 180 - dir;
        //smooth out changes
        if(last.direction) dir = Math.round((dir + last.direction)/2);
        if (last.totalX) totalX += Math.abs(last.totalX);
        if (last.totalY) totalY += Math.abs(last.totalY);
        var speed = Math.sqrt(distX * distX + distY * distY);
        if(last.speed) speed = (last.speed + speed)/2;
        var params = {
						button: button,
            direction: dir,
            distX: distX,
            distY: distY,
            speed: Math.round(speed),
            speedX: distX / dur,
            speedY: distY / dur,
            totalX: totalX,
            totalY: totalY,
            elapsedTime: dur,
            totalTime: totalTime
        }
        for (var p in params) {
            e[p] = params[p];
            //Object.defineProperty(e, p, {
            //   value: params[p],
            //    writable: false
            //});
        }
        return true;
    }
    var usingPointers = false;
    if (window.onpointerdown !== undefined) {
        usingPointers = {};
        usingPointers.down = "pointerdown";
        usingPointers.move = "pointermove";
        usingPointers.up = "pointerup";
        usingPointers.out = "pointerout";
    } else if (window.onmspointerdown !== undefined) {
        usingPointers = {};
        usingPointers.down = "MSPointerDown";
        usingPointers.move = "MSPointerMove";
        usingPointers.up = "MSPointerUp";
        usingPointers.out = "MSPointerOut";
    }
    if (usingPointers !== false) {
        targetElement.addEventListener(usingPointers.down, function (evt) {
            evt.preventDefault();
            var b = evt.button;
            var e = copyEvent(evt);
            if (e.pointerType == "mouse") {
                button = e.button;
            } else {
                button = null;
            }
            e.eventTime = Date.now();
            //if (e.pointerType == "mouse" && e.button == -1) return;
            e.eventTime = Date.now();
            recentPointers[e.pointerId] = e;//current state
            curPointers[e.pointerId] = e;//current state
        });
        targetElement.addEventListener(usingPointers.move, function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            if(e.pointerType == "mouse" && button == null) return;
            e.eventTime = Date.now();
            curPointers[e.pointerId] = e;
            var last = recentPointers[e.pointerId];
            if (last) {
                updatePointerEvent(e, last);
                if (busy) return;
                busy = true;
                var gEvent = createGestureEvent("pointermove");
                if (gEvent) dispatchGesture(gEvent);
                busy = false;
            }
        });
        var ptrEnd = function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            var isLast = false;
            curPointers[e.pointerId] = e;
            var curAry = copyPointers(curPointers);
            if (curAry.length < 2) isLast = true;
            if (recentPointers[e.pointerId]) {
                var last = recentPointers[e.pointerId];
                updatePointerEvent(e, last);
            }
            e.ended = true;
            var gEvent = createGestureEvent("pointerend", isLast);
            if (gEvent) dispatchGesture(gEvent);
            curPointers[e.pointerId] = null;
            recentPointers[e.pointerId] = null;
            delete curPointers[e.pointerId];
            delete recentPointers[e.pointerId];
            //lastGesture = null;
            if (isLast  || e.pointerType=="mouse") button = null;
        }
        targetElement.addEventListener(usingPointers.up, ptrEnd);
        targetElement.addEventListener(usingPointers.out, function(evt){
					if(curPointers[evt.pointerId]) ptrEnd(evt);
        });
    } else {
        //add mouse and touch events
        targetElement.addEventListener('mousedown', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            button = e.button;
            e.pointerId = 0;
            if(!e.pointerType) e.pointerType = "mouse";
            if (e.pointerType == "mouse" && e.button == -1) return;
            e.eventTime = Date.now();
            recentPointers[0] = e;//current state
            curPointers[0] = e;//current state
        });
        targetElement.addEventListener('touchstart', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            button = null;
            e.eventTime = Date.now();
            for (var i = 0; i < e.targetTouches.length; i++) {
                var t = copyEvent(e.targetTouches[i]);
                if(!t.identifier) t.identifier = 0;
                t.eventTime = e.eventTime;
                t.pointerId = t.identifier;
                t.pointerType = "touch";
                recentPointers[t.identifier] = t;//current state
                curPointers[t.identifier] = t;//current state
            }
        });
        targetElement.addEventListener('mousemove', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            e.pointerId = 0;
            if(!e.pointerType) e.pointerType = "mouse";
            curPointers[0] = e;
            var last = recentPointers[0];
            if (last) {
                updatePointerEvent(e, last);
                //setTimeout(function(){
                if (busy) return;
                busy = true;
                var gEvent = createGestureEvent('mousemove');
                if (gEvent) dispatchGesture(gEvent);
                busy = false;
                //},gestureTimeout);
            }
        });
        targetElement.addEventListener('touchmove', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            for (var i = 0; i < e.targetTouches.length; i++) {
                var t = copyEvent(e.targetTouches[i]);
                if(!t.identifier) t.identifier = 0;
                t.pointerId = t.identifier;
                t.eventTime = e.eventTime;
                t.pointerType = "touch";
                curPointers[t.identifier] = t;//current state
                var last = recentPointers[t.identifier];
                if (last) {
                    updatePointerEvent(t, last);
                }
            }
            if (busy) return;
            busy = true;
            var gEvent = createGestureEvent('touchmove');
            if (gEvent) dispatchGesture(gEvent);
            busy = false;
        });
        targetElement.addEventListener('mouseup', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            e.pointerId = 0;
            if(!e.pointerType) e.pointerType = "mouse";
            if (recentPointers[0]) {
                curPointers[0] = e;
								e.ended = true;
                //fire gestures
                var last = recentPointers[0];
                if (last) {
                    updatePointerEvent(e, last);
                    var gEvent = createGestureEvent('mouseup', true);
                    if (gEvent) dispatchGesture(gEvent);
                }
            }
            //there is only one mouse pointer, so reset everything
            curPointers = {};
            recentPointers = {};
            lastGesture = null;
            button = null;
        });
        targetElement.addEventListener('touchend', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            if(!e.pointerType) e.pointerType = "touch";
            for (var i = 0; i < e.changedTouches.length; i++) {
                var t = copyEvent(e.changedTouches[i]);
                if(!t.identifier) t.identifier = 0;
                t.pointerId = t.identifier;
                t.pointerType = "touch";
                t.ended = true;
                t.eventTime = e.eventTime;
                curPointers[t.identifier] = t;//current state
                var last = recentPointers[t.identifier];
                if (last) {
                    updatePointerEvent(t, last);
                }
            }
            //if all touches lifted, changedTouches will have lifted touches,
            //but targetTouches will be empty
            var isLast = (e.targetTouches.length < 1);
            if (e.changedTouches.length > 0) {
                var gEvent = createGestureEvent('touchend', isLast);
                if (gEvent) dispatchGesture(gEvent);
                //delete the ones causing the touchend
                for (var i = 0; i < e.changedTouches.length; i++) {
									curPointers[e.changedTouches[i].identifier] = null;
									recentPointers[e.changedTouches[i].identifier] = null;
                    delete curPointers[e.changedTouches[i].identifier];
                    delete recentPointers[e.changedTouches[i].identifier];
                }
            }
            if (isLast) {
                curPointers = {};
                recentPointers = {};
                lastGesture = null;
            }
        });
    }
};