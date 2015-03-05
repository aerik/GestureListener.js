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
                var pointerEvent = document.createEvent('UIEvents');
                pointerEvent.initUIEvent(type, bubbles, true, window, 0);

                return pointerEvent;
            };
        }
    }

    if (!createUIEvent) {
        throw new Error('Cannot create events. You may be using an unsupported browser.');
    }

    var createEvent = function (type, params, noBubble) {
        var pointerEvent, i;

        pointerEvent = createUIEvent(type, !noBubble);
        //delete original pageX and Y so they can be set by Params
        delete pointerEvent.pageX;
        delete pointerEvent.pageY;

        for (var p in params) {
            Object.defineProperty(pointerEvent, p, {
                value: params[p],
                writable: false
            });
        }
        return pointerEvent;
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

    //arg: pointerEvent Array
    var createGestureEvent = function (triggerType) {
        /*
			* tap - one pointer, little movement, short duration, end of event only
			* hold - one pointer, little movement, long duration, end of event only
			* pan - one pointer, slow movement
			* swipe - one pointer, fast movement
			* pinch - two pointers, move towards or away from each other
			*/
        var ps = copyPointers(curPointers);
        if(ps.length < 1 || !ps[0].totalTime) return;
        var pt = ps[0];
        var isLast = false;
        if (triggerType == "mouseup" || triggerType == "touchend") isLast = true;
        var params = {
            target: targetElement,
            name: null,
            pointers: ps,
            ended: isLast,
            pageX: pt.pageX,
            pageY: pt.pageY
        };
        if (pt.ended) params.ended = true;//needs testing
        var totalMove = Math.abs(pt.distX) + Math.abs(pt.distY);
        if (ps.length == 1) {
            if (totalMove < 10 && !lastGesture) {
                if (pt.ended) {
                    if (pt.totalTime < 200) {
                        params.name = "tap";
                    } else {
                        if (pt.totalTime < 2000) {
                            params.name = "hold";
                        }
                    }
                }//else do nothing - wait to see what happens
            } else {
                //pan, swipe
                //var totalSpeed = Math.abs(pt.speedX) + Math.abs(pt.speedY);
                params.moveX = pt.distX;
                params.moveY = pt.distY;
                var totalSpeed = totalMove / pt.totalTime;
                if (totalMove < 30 || totalSpeed < 2) {
                    params.name = "pan";
                } else {
                    if(pt.ended){
                        params.name = "swipe";
                    }
                } 
            }
        } else if (ps.length == 2) { //two pointers
            var p2 = ps[1];//second pointer
            if (recentPointers[pt.pointerId] && recentPointers[p2.pointerId]) {
                var curDist = getDist(pt, p2);
                var lastDist = getDist(recentPointers[pt.pointerId], recentPointers[p2.pointerId]);
                var distChg = Math.round(curDist - lastDist);
                if (Math.abs(distChg) >= 2) {
                    params.name = "pinch";
                    params.pinchPx = distChg;
                    params.moveX = Math.round((pt.distX + p2.distX) / 2);
                    params.moveY = Math.round((pt.distY + p2.distY) / 2);
                }
                //firing an alternate "pan" gesture doesn't work too well here... hmm...
            }
        } else if (ps.length > 2) {
            //multi pointer... fire "multipan"
            var p2 = ps[1];//second pointer
            var p3 = ps[2];
            //don't know why need to divid by 9 instead of 3 - bug?
            var divisor = 3;
            if (usingPointers) divisor = 9;
            var moveX = Math.round((pt.distX + p2.distX + p3.distX) / divisor);
            var moveY = Math.round((pt.distY + p2.distY + p3.distY) / divisor);
            if (moveX != 0 || moveY != 0) {
                params.name = "multipan";
                params.moveX = moveX;
                params.moveY = moveY;
            }
        }
        //only fire if we have data
        if (params.name || isLast) {
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
            for (var lp in curPointers) {
                recentPointers[lp] = curPointers[lp];
            }
            return gEvent;
        }
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
        var params = ["target","pageX", "pageY", "identifier", "button", "targetTouches", "changedTouches"];
        for (var i = 0; i < params.length; i++) {
            if (e[params[i]]) {
                copy[params[i]] = e[params[i]];
            }
        }
        return copy;
    }

    var updatePointerEvent = function (e, last) {
        var dur = e.eventTime - last.eventTime;
        var distX = e.pageX - last.pageX;
        var distY = e.pageY - last.pageY;
        var params = {
            distX: distX,
            distY: distY,
            speedX: distX / dur,
            speedY: distY / dur,
            totalTime: dur
        }
        for (var p in params) {
            //e[p] = params[p];
            Object.defineProperty(e, p, {
                value: params[p],
                writable: false
            });
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
        targetElement.addEventListener(usingPointers.down, function (e) {
            e.preventDefault();
            if (e.pointerType == "mouse") {
                button = e.button;
            } else {
                button = null;
            }
            e.eventTime = Date.now();
            if (e.pointerType == "mouse" && e.button == -1) return;
            e.eventTime = Date.now();
            recentPointers[e.pointerId] = e;//current state
            curPointers[e.pointerId] = e;//current state
        });
        targetElement.addEventListener(usingPointers.move, function (e) {
            e.preventDefault();
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
        var ptrEnd = function (e) {
            e.preventDefault();
            e.eventTime = Date.now();
            var isLast = false;
            if (copyPointers(curPointers).length == 1) isLast = true;
            if (recentPointers[e.pointerId]) {
                var last = recentPointers[e.pointerId];
                curPointers[e.pointerId] = e;
                Object.defineProperty(e, "ended", {
                    value: true,
                    writable: false
                });
                //fire gestures
                updatePointerEvent(e, last);
                var gEvent = createGestureEvent("pointerend");
                if (gEvent) dispatchGesture(gEvent);
            }
            delete curPointers[e.pointerId];
            delete recentPointers[e.pointerId];
            lastGesture = null;
            if (isLast) button = null;
        }
        targetElement.addEventListener(usingPointers.up, ptrEnd);
        targetElement.addEventListener(usingPointers.out, ptrEnd);
    } else {
        //add mouse and touch events
        targetElement.addEventListener('mousedown', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            button = e.button;
            e.pointerId = 0;
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
                t.eventTime = e.eventTime;
                t.pointerId = t.identifier;
                recentPointers[t.identifier] = t;//current state
                curPointers[t.identifier] = t;//current state
            }
        });
        targetElement.addEventListener('mousemove', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            e.pointerId = 0;
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
                t.pointerId = t.identifier;
                t.eventTime = e.eventTime;
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
            if (recentPointers[0]) {
                curPointers[0] = e;
                Object.defineProperty(e, "ended", {
                    value: true,
                    writable: false
                });
                //fire gestures
                var last = recentPointers[0];
                if (last) {
                    updatePointerEvent(e, last);
                    var gEvent = createGestureEvent('mouseup');
                    if (gEvent) dispatchGesture(gEvent);
                }
            }
            curPointers = {};
            recentPointers = {};
            lastGesture = null;
            button = null;
        });
        targetElement.addEventListener('touchend', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = Date.now();
            for (var i = 0; i < e.changedTouches.length; i++) {
                var t = copyEvent(e.changedTouches[i]);
                t.pointerId = t.identifier;
                Object.defineProperty(t, "ended", {
                    value: true,
                    writable: false
                });
                t.eventTime = e.eventTime;
                curPointers[t.identifier] = t;//current state
                var last = recentPointers[t.identifier];
                if (last) {
                    updatePointerEvent(t, last);
                }
            }
            var isLast = (e.targetTouches.length < 1);
            if (e.changedTouches.length > 0) {
                var gEvent = createGestureEvent('touchend');
                if (gEvent) dispatchGesture(gEvent);
                //delete the ones causing the touchend
                for (var i = 0; i < e.changedTouches.length; i++) {
                    delete curPointers[e.changedTouches[i].identifier];
                    delete recentPointers[e.changedTouches[i].identifier];
                }
            }
            if (e.targetTouches.length < 1) {
                curPointers = {};
                recentPointers = {};
                lastGesture = null;
            }
        });
    }
};