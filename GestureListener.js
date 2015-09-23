
/* GestureListener v0.5
 * A Javascript gesture libaray 
 * https://github.com/aerik/GestureListener.git
 * Copyright (c) 2015 Aerik Sylvan; Released under the MIT License 
 * 
 * Some code taken from, and credit and attribution due to:
 * Points - v0.1.1 - 2013-07-11
 * Another Pointer Events polyfill
 * http://rich-harris.github.io/Points
 * Copyright (c) 2013 Rich Harris; Released under the MIT License 
 */

/************************** GestureListener ***********************************/
/**
* Model for GestureListener  
*
* @constructor
*/
var GestureListener = function (targetElement) {
    var recentPointers = {};//set on first touch of pointer, updated on gesture, reset on pointer end
    var curPointers = {};//always holds most recent pointers, but reset on pointer end
    var lastGesture = null;//any gesture, even invalid ones, reset to null under certain circumstances
    var lastEvent = null;//only valid gesture events
    var self = this;
    var button = null;
    var gestureStartTime = null;
    var numEvents = 0; //in gesture
    var rotateTotal = 0;
    this.onGesture = null;

    this.getPointers = function () {
        return copyPointers(curPointers);
    }
    var startGesture = function () {
        //could do more here...
        gestureStartTime = Date.now();
        numEvents = 0;
        rotateTotal = 0;
    }

    var endGesture = function () {
        curPointers = {};
        recentPointers = {};
        lastGesture = null;
        button = null;
    }

    var dispatchGesture = function (gesture) {
        if (gesture == null || gesture.name == null) return;
        if (self.onGesture != null) {
            self.onGesture(gesture);
        } else {
            var gEvent = createEvent("gesture", gesture, true);
            if (gEvent) targetElement.dispatchEvent(gEvent);
        }
    }

    var createUIEvent = function () { };
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
        } else {
            createUIEvent = null;
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

    var createGestureEvent = function (triggerType, isLast) {
        /*
		* tap - one pointer, little movement, short duration, end of event only
		* hold - one pointer, little movement, long duration, end of event only
		* pan - one pointer, slow movement
		* swipe - one pointer, fast movement
		* pinch - two pointers, move towards or away from each other
		*/
        numEvents++;
        var ps = copyPointers(curPointers);
        if (ps.length < 1) {
            console.log("no pointers " + triggerType + " " + isLast.toString());
            return null;
        }
        var pt = ps[0];
        var gestureTime = pt.eventTime - gestureStartTime;
        if (typeof isLast == "undefined") isLast = false;
        //var ptDistSq = Math.abs(pt.moveX) + Math.abs(pt.moveY);
        //var ptTotalDist = ptDistSq;
        var ptTotalDist = 0;
        if (pt.totalX || pt.totalY) ptTotalDist = pt.totalX + pt.totalY;
        var avgSpeed = ptTotalDist / pt.totalTime;
        var lastGestureName = (lastGesture != null) ? lastGesture.name : null;
        var params = {
            target: targetElement,
            name: null,
            pointers: ps,
            ended: isLast,
            pageX: pt.pageX,
            pageY: pt.pageY,
            speed: avgSpeed,
            duration: gestureTime,
            lastEvent: lastEvent,
            numEvents: numEvents,
            eventTime: pt.eventTime,
            totalDist: ptTotalDist,
            handled: false
        };
        //only one pointer
        if (ps.length == 1) {
            if (ptTotalDist < 10 && (lastGestureName==null) && isLast) {
                if (pt.totalTime < 500) {
                    //better to use setTimeout so we don't fire
                    //tap and also doubletap?
                    params.name = "tap";
                    if (lastEvent) {
                        if (lastEvent.name == "tap" && !lastEvent.handled) { // && lastEvent.target == targetElement
                            var tapdur = pt.eventTime - lastEvent.eventTime;
                            if (tapdur < 350) {
                                params.name = "doubletap";
                            }
                        }
                    }
                } else {
                    if (pt.totalTime < 3000) {
                        params.name = "hold";
                    }
                }
            } else if(ptTotalDist > 4){  //pan, swipe
                params.moveX = pt.moveX;
                params.moveY = pt.moveY;
                if (isLast && avgSpeed > 1.5 && gestureTime < 300) {
                    var rec1 = recentPointers[pt.pointerId];
                    params.name = "swipe";
                    params.moveX = pt.distX
                    params.moveY = pt.distY;
                } else if (Math.abs(pt.moveX) > 0 || Math.abs(pt.moveY) > 0) {
                    params.name = "pan";
                }
            }
        } else if (ps.length == 2) { //two pointers
            var p2 = ps[1];//second pointer
            if (recentPointers[pt.pointerId] && recentPointers[p2.pointerId]) {
                var rec1 = recentPointers[pt.pointerId];
                var rec2 = recentPointers[p2.pointerId]
                //var dirDelta = pt.direction > p2.direction ? pt.direction - p2.direction : p2.direction - pt.direction;
                //if (dirDelta > 180) dirDelta = Math.abs(dirDelta - 360);//closer the other direction
                var curDist = getDist(pt, p2);
                var lastDist = getDist(rec1, rec2);
                var distChg = Math.round((curDist - lastDist)*10000)/10000;
                var curCenter = { x: Math.round((pt.pageX + p2.pageX) / 2), y: Math.round((pt.pageY + p2.pageY) / 2) };
                var oldCenter = { x: Math.round((rec1.pageX + rec2.pageX) / 2), y: Math.round((rec1.pageY + rec2.pageY) / 2) };
                if (pt.moveX != 0 || pt.moveY != 0 || p2.moveX != 0 || p2.moveX != 0) {
                    params.moveX = Math.round(curCenter.x - oldCenter.x);
                    params.moveY = Math.round(curCenter.y - oldCenter.y);
                }
                params.pageX = curCenter.x;
                params.pageY = curCenter.y;
                //params.directionDelta = dirDelta;
                params.pointerDistance = curDist;
                params.name = "pinch";
                var avgTime = (pt.eventTime - rec1.eventTime + p2.eventTime - rec2.eventTime) / 2;
                params.speed = Math.round(distChg / avgTime * 100) / 100;
                params.pinchPx = distChg;
                //check for rotation
                //all this seems intuitive, but isn't right.  Need to think it through
                var originCtr = { x: Math.round((pt.originX + p2.originX) / 2), y: Math.round((pt.originY + p2.originY) / 2) };
                var ptAngle0 = getDir(pt.originY - originCtr.y, pt.originX - originCtr.x);
                var ptAngle1 = getDir(rec1.pageY - originCtr.y, rec1.pageX - originCtr.x);
                var ptAngle2 = getDir(pt.pageY - originCtr.y, pt.pageX - originCtr.x);
                var ptClockwise = isClockwise(ptAngle0, ptAngle2);
                var p2Angle0 = getDir(p2.originY - originCtr.y, p2.originX - originCtr.x);
                var p2Angle1 = getDir(rec2.pageY - originCtr.y, rec2.pageX - originCtr.x);
                var p2Angle2 = getDir(p2.pageY - originCtr.y, p2.pageX - originCtr.x);
                var p2Clockwise = isClockwise(p2Angle0, p2Angle2);
                //console.log("pt ", ptAngle0, ptAngle2, "p2 ", p2Angle0, p2Angle2);
                if (ptClockwise !== null && ptClockwise === p2Clockwise) {
                    var ptDiff = getAngleDiff(ptAngle1, ptAngle2);
                    var p2Diff = getAngleDiff(p2Angle1, p2Angle2);
                    var rotDeg = (ptDiff + p2Diff) / 2;
                    if (rotDeg != 0){ //(ptAngle1,ptAngle2,p2Angle1,p2Angle2,
                        //console.log(ptDiff,p2Diff, rotDeg, rotateTotal);
                        rotateTotal += rotDeg;
                        params.rotate = rotDeg;
                    }
                }
            }
        }//could do 3 finger actions here
        if (!params) return null;
        if (params.name == "swipe") {
            //reset - stop gesture after swipe
            curPointers = {};
            lastGesture = null;
        }
        params.button = button;
        if (isLast) {
            if (params.name == null && lastGesture) params.name = lastGesture.name;
            if (lastGesture && !params.rotate && lastGesture.rotate) params.rotate = lastGesture.rotate;
        }
        lastGesture = params;
        var gEvent = params;
        if (gEvent.name) lastEvent = gEvent;//only remember if it was a valid event
        recentPointers = {};
        if (!isLast) {
            for (var lp in curPointers) {
                recentPointers[lp] = curPointers[lp];
            }
        }
        //don't call endGesture here, the gEvent is still being handled
        return gEvent;
    }
    //gets direction in degrees, inverts Y so that 90 degrees is up
    var getDir = function (yDiff, xDiff) {
        var angleDeg = Math.atan2(-yDiff, xDiff) * (180 / Math.PI);
        if (angleDeg < 0) angleDeg = angleDeg + 360;
        return Math.round(angleDeg * 10)/10;
    }
    //assumes travel in shortest distance
    var getAngleDiff = function (angle1Deg, angle2Deg) {
        var diff = angle1Deg - angle2Deg;
        if (diff < -180) diff += 360;
        if (diff > 180) diff -= 360;
        return diff;
    }
    //assumes travel in shortest distance
    var isClockwise = function (angle1Deg, angle2Deg) {
        var diff = angle1Deg - angle2Deg;
        if (diff < -180) diff += 360;
        var clockwise = false;
        if (diff == 0 || diff == 180) clockwise = null;
        if (diff > 0 && diff < 180) clockwise = true;
        return clockwise;
    }

    var getDist = function (p1, p2) {
        var xdelta = p2.pageX - p1.pageX;
        var ydelta = p2.pageY - p1.pageY;
        var curDist = Math.sqrt((xdelta * xdelta) + (ydelta * ydelta));
        return curDist;
    }

    var copyEvent = function (e) {
        var copy = {};
        var params = ["target", "pageX", "pageY", "pointerId", "identifier", "button", "targetTouches", "changedTouches", "pointerType", "type"];
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
        if (dur == 0) dur = 0.001;//create minimal duration in event of zero
        if (last.totalTime) totalTime += last.totalTime;
        var moveX = e.pageX - last.pageX;
        var moveY = e.pageY - last.pageY;
        var totalX = Math.abs(moveX);
        var totalY = Math.abs(moveY);
        var distX = moveX;
        var distY = moveY;
        if (last.distX) {
            distX = distX + last.distX;
            distY = distY + last.distY;
        }
        var dir = null;
        var x = moveX;
        var y = moveY;
        //average out the current and most recent vectors
        if (typeof last.moveX != "undefined") {
            x = (x + last.moveX) / 2;
            y = (y + last.moveY) / 2;
        }
        //this gives intuitive results, 90 is up, 180 is to the left	
        dir = Math.round(Math.atan2(-y, x) * (180 / Math.PI));
        if (dir < 0) dir = dir + 360;
        if (last.totalX) {
            totalX += Math.abs(last.totalX);
            totalY += Math.abs(last.totalY);
        }
        var d2 = (moveX * moveX) + (moveY * moveY);
        var speed = 0;
        if (d2 > 0) {
            speed = Math.sqrt(d2) / dur;
            //smooth out speed changes
            if (last.speed) speed = (last.speed + 4 * speed) / 5;
            speed = (Math.floor(speed * 100) / 100);
        } else {
            speed = Math.floor(e.speed * 90) / 100;
        }
        var vectorAvg = null;
        if (typeof (last.moveX) != "undefined") {
            var vectorAvg = { x: (moveX + last.moveX) / 2, y: (moveY + last.moveY) / 2 };
        }
        if (vectorAvg && last.vectorAvg) {
            vectorAvg.x = (vectorAvg.x + last.vectorAvg.x) / 2;
            vectorAvg.y = (vectorAvg.y + last.vectorAvg.y) / 2;
        }
        var params = {
            button: button,//mouse button that is down
            direction: dir,//direction pointer is moving
            distX: distX,//distance from starting point
            distY: distY,
            moveX: moveX,//how far it just moved
            moveY: moveY,
            speed: speed,//approximate speed in pixels / ms
            totalX: totalX,//how many pixels pointer has moved on X axis total
            totalY: totalY,
            elapsedTime: dur,//ms since the last pointer movement
            totalTime: totalTime,//ms since pointer started activity
            vectorAvg: vectorAvg //average direction of the pointers vector
        }
        for (var p in params) {
            e[p] = params[p];
            //Object.defineProperty(e, p, {
            //   value: params[p],
            //    writable: false
            //});
        }
        if (!e.originX && last.originX) e.originX = last.originX;
        if (!e.originY && last.originY) e.originY = last.originY;
        if (d2 == 0) return false;//didn't move
        return true;
    }
    var usingPointers = {};
    usingPointers.down = "";
    usingPointers.move = "";
    usingPointers.up = "";
    usingPointers.out = "";
    if (window["onpointerdown"] !== undefined) {
        usingPointers.down = "pointerdown";
        usingPointers.move = "pointermove";
        usingPointers.up = "pointerup";
        usingPointers.out = "pointerout";
    } else if (window["onmspointerdown"] !== undefined) {
        usingPointers.down = "MSPointerDown";
        usingPointers.move = "MSPointerMove";
        usingPointers.up = "MSPointerUp";
        usingPointers.out = "MSPointerOut";
    } else {
        usingPointers = false;
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
            e.originX = e.pageX;
            e.originY = e.pageY;
            e.eventTime = evt.timeStamp;
            recentPointers[e.pointerId] = e;//current state
            curPointers[e.pointerId] = e;//current state
            startGesture();
        });
        targetElement.addEventListener(usingPointers.move, function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            if (e.pointerType == "mouse" && button == null) return;
            e.eventTime = evt.timeStamp;
            curPointers[e.pointerId] = e;
            var last = recentPointers[e.pointerId];
            if (last) {
                updatePointerEvent(e, last);
                var gEvent = createGestureEvent("pointermove",false);
                if (gEvent) dispatchGesture(gEvent);
            }
        });
        var ptrEnd = function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = evt.timeStamp;
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
            if (e.pointerType == "mouse") button = null;
            if (isLast) endGesture();
        }
        targetElement.addEventListener(usingPointers.up, ptrEnd);
        targetElement.addEventListener(usingPointers.out, function (evt) {
            if (curPointers[evt.pointerId]) ptrEnd(evt);
        });
    } else {
        //add mouse and touch events
        targetElement.addEventListener('mousedown', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            button = e.button;
            e.pointerId = 0;
            if (!e.pointerType) e.pointerType = "mouse";
            if (e.pointerType == "mouse" && e.button == -1) return;
            e.eventTime = evt.timeStamp;
            e.originX = e.pageX;
            e.originY = e.pageY;
            recentPointers[0] = e;//current state
            curPointers[0] = e;//current state
            startGesture();
        });
        targetElement.addEventListener('touchstart', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            button = null;
            e.eventTime = evt.timeStamp;
            for (var i = 0; i < e.targetTouches.length; i++) {
                var t = copyEvent(e.targetTouches[i]);
                if (!t.identifier) t.identifier = 0;
                t.eventTime = e.eventTime;
                t.pointerId = t.identifier;
                t.pointerType = "touch";
                t.originX = t.pageX;
                t.originY = t.pageY;
                recentPointers[t.identifier] = t;//current state
                curPointers[t.identifier] = t;//current state
            }
            startGesture();
        });
        targetElement.addEventListener('mousemove', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = evt.timeStamp;
            e.pointerId = 0;
            if (!e.pointerType) e.pointerType = "mouse";
            curPointers[0] = e;
            var last = recentPointers[0];
            if (last) {
                updatePointerEvent(e, last);
                //setTimeout(function(){
                var gEvent = createGestureEvent('mousemove',false);
                if (gEvent) dispatchGesture(gEvent);
                //},gestureTimeout);
            }
        });
        targetElement.addEventListener('touchmove', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = evt.timeStamp;
            for (var i = 0; i < e.targetTouches.length; i++) {
                var t = copyEvent(e.targetTouches[i]);
                if (!t.identifier) t.identifier = 0;
                t.pointerId = t.identifier;
                t.eventTime = e.eventTime;
                t.pointerType = "touch";
                curPointers[t.identifier] = t;//current state
                var last = recentPointers[t.identifier];
                if (last) {
                    updatePointerEvent(t, last);
                    var gEvent = createGestureEvent('touchmove',false);
                    if (gEvent) dispatchGesture(gEvent);
                }
            }
        });
        targetElement.addEventListener('mouseup', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = evt.timeStamp;
            e.pointerId = 0;
            if (!e.pointerType) e.pointerType = "mouse";
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
            endGesture();
        });
        targetElement.addEventListener('touchend', function (evt) {
            evt.preventDefault();
            var e = copyEvent(evt);
            e.eventTime = evt.timeStamp;
            if (!e.pointerType) e.pointerType = "touch";
            for (var i = 0; i < e.changedTouches.length; i++) {
                var t = copyEvent(e.changedTouches[i]);
                if (!t.identifier) t.identifier = 0;
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
                endGesture();
            }
        });
    }
};