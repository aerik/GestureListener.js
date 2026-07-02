
/* GestureListener v0.93
 * A Javascript gesture libaray
 * https://github.com/aerik/GestureListener.git
 * Copyright (c) 2015-2026 Aerik Sylvan; Released under the MIT License
 *
 */

/**
 * @fileoverview This is a file where deprecation checks are disabled.
 * @suppress {deprecated}
 */

/************************** GestureListener ***********************************/
/**
* Model for GestureListener
*
* @constructor
*/
function GestureListener(targetElement) {
    let recentPointers = {};//set on first touch of pointer, updated on gesture, reset on pointer end
    let curPointers = {};//always holds most recent pointers, but reset on "endGesture"
    let currentGesture = null;//any gesture, even invalid ones, cleared on gesture end - used to inherit rotation
    let lastEvent = null; //mainly for debugging, never cleared, could be anything
    let lastGesture = null;//only valid gesture events - used for tap/doubletap and figuring out what we were doing when a "isLast" is triggered with no name
    const self = this;
    let button = null;
    let gestureStartTime = null;
    let numEvents = 0; //in gesture
    let rotateTotal = 0;
    let minWaitMs = 20;//wait time between firing events, 20 would limit to 50 events / second
    let lastGestureCreated = 0;
    const pointerFields = ["target", "offsetX", "offsetY", "pageX", "pageY", "pointerId", "identifier", "button", "buttons", "targetTouches", "changedTouches", "pointerType", "type", "shiftKey", "ctrlKey", "altKey"];
    this.onGesture = null;
    const debugEvents = {};

    this.debugEvent = function (evtName) {
        debugEvents[evtName] = true;
    }

    const debug = function (evtName, args=null) {
        if (debugEvents[evtName]) {
            if (args) {
                console.debug(evtName, args);
            } else {
                console.debug(evtName);
            }
        }
    }

    const ppi = (function () {
        if (document && document.defaultView) {
            const DOM_body = document.getElementsByTagName('body')[0];
            if (DOM_body) {
                const DOM_div = document.createElement('div');
                DOM_div.style = 'width: 1in; visibility:hidden;';
                DOM_body.appendChild(DOM_div);
                const w = document.defaultView.getComputedStyle(DOM_div, null).getPropertyValue('width');
                DOM_body.removeChild(DOM_div);
                return parseInt(w, 10);
            }
        }
        return 0;
    }())
    let tapToleranceRadius = 10;
    if (ppi) {
        this.tapTolerance = ppi / 100;
    } else {
        let scrnSizeFactor = (screen.availHeight + screen.availWidth) / 250;
        if (scrnSizeFactor > tapToleranceRadius) tapToleranceRadius = scrnSizeFactor;
    }

    const getTapTolerance = function () {
        let tapTol = tapToleranceRadius;
        if (window && window.devicePixelRatio) tapTol = tapToleranceRadius / window.devicePixelRatio;
        if (tapTol < tapToleranceRadius) tapTol = tapToleranceRadius;
        return tapTol;
    }

    this.PPI = function () {
        return ppi;
    }

    this.tapTolerance = function () {
        return getTapTolerance();
    }

    this.getCurrentGesture = function () {
        return currentGesture;
    }

    this.getlastGesture = function () {
        return lastGesture;
    }

    this.getPointers = function () {
        return copyPointers(curPointers);
    }
    const startGesture = function () {
        //could do more here...
        gestureStartTime = Date.now();
        numEvents = 0;
        rotateTotal = 0;
        //check for a game controller
    }

    const endGesture = function () {
        curPointers = {};
        recentPointers = {};
        currentGesture = null;
        button = null;
        gestureStartTime = null;
        ////console.debug("Gesture Ended");
    }

    const dispatchGesture = function (gesture, async) {
        if (gesture == null) {
            ////console.debug("No gesture found");
            return;
        };
        if (gesture.name == null) { // && !gesture.ended
            ////console.debug("Empty gesture:", gesture);
            return;
        }
        if (self.onGesture != null) {
            if (async) {
                setTimeout(function () {
                    self.onGesture(gesture);
                }, 0);
            } else {
                self.onGesture(gesture);
            }
        } else {
            const gEvent = createEvent("gesture", gesture, true);
            if (gEvent) targetElement.dispatchEvent(gEvent);
        }
    }

    let createUIEvent = function () { };
    // Can we create events using the MouseEvent constructor? If so, gravy
    try {
        let i = new UIEvent('test');
        createUIEvent = function (type, bubbles) {
            return new UIEvent(type, { view: window, bubbles: bubbles });
        };
        // otherwise we need to do things oldschool
    } catch (err) {
        if (document.createEvent) {
            createUIEvent = function (type, bubbles) {
                let uiEvent = document.createEvent('UIEvents');
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

    const createEvent = function (type, params, noBubble) {
        let uiEvent, i;

        uiEvent = createUIEvent(type, !noBubble);
        //delete original pageX and Y so they can be set by Params
        delete uiEvent.pageX;
        delete uiEvent.pageY;
        delete uiEvent.offsetX;
        delete uiEvent.offsetY;

        for (let p in params) {
            Object.defineProperty(uiEvent, p, {
                value: params[p],
                writable: false
            });
        }
        return uiEvent;
    };

    //returns an Array instead of an Object
    const copyPointers = function (pointerList) {
        let p1 = [];
        //use the most recent pointer states
        //they should have distance and speed properties
        for (let p in pointerList) {
            p1.push(pointerList[p]);
        }
        return p1;
    }

    const createHoverEvent = function (pt) {
        const params = {
            target: targetElement,
            name: "hover",
            pointers: [pt],
            offsetX: pt.offsetX,
            offsetY: pt.offsetY,
            pageX: pt.pageX,
            pageY: pt.pageY,
            altKey: pt.altKey,
            ctrlKey: pt.ctrlKey,
            shiftKey: pt.shiftKey,
            handled: false
        };
        lastEvent = params;
        return params;
    }

    const createGestureEvent = function (triggerType, isLast) {
        /*
        * tap - one pointer, little movement, short duration, end of event only
        * hold - one pointer, little movement, long duration, end of event only
        * pan - one pointer, slow movement
        * swipe - one pointer, fast movement
        * pinch - two pointers, move towards or away from each other
        */
        if (!gestureStartTime) {
            debug("nogesture", "no gestureStartTime");
            //hover is handled in pointermove, special case
            return;
        }
        let now = Date.now();
        if (minWaitMs && lastGestureCreated && !isLast && triggerType != "pointerdown") {
            //check throttle timer, but always fire on last and on pointerdown (so tap and doubletap always work)
            //this works because gestures are calculated based on a chanage from previous pointer position
            let elapsed = now - lastGestureCreated;
            if (elapsed < minWaitMs) {
                return null;
            }
        }
        lastGestureCreated = now;
        numEvents++;
        const ps = copyPointers(curPointers);
        if (ps.length < 1) {
            console.warn("no pointers " + triggerType + " " + isLast.toString());
            return null;
        }
        let pt = ps[0];
        let gestureTime = pt.eventTime - gestureStartTime;
        if (typeof isLast == "undefined") isLast = false;
        //let ptDistSq = Math.abs(pt.moveX) + Math.abs(pt.moveY);
        //let ptTotalDist = ptDistSq;
        let ptTotalDist = 0;
        if (pt.totalX || pt.totalY) ptTotalDist = (Math.abs(pt.totalX) + Math.abs(pt.totalY)) / 2;
        let avgSpeed = ptTotalDist / pt.totalTime;
        let currentGestureName = (currentGesture != null) ? currentGesture.name : null;
        let buttons = pt.buttons;
        let debugStr = "";
        let params = {
            target: targetElement,
            name: null,
            pointers: ps,
            ended: isLast,
            offsetX: pt.offsetX,
            offsetY: pt.offsetY,
            pageX: pt.pageX,
            pageY: pt.pageY,
            speed: avgSpeed,
            duration: gestureTime,
            lastGesture: lastGesture,
            numEvents: numEvents,
            eventTime: pt.eventTime,
            totalDist: ptTotalDist,
            altKey: pt.altKey,
            ctrlKey: pt.ctrlKey,
            shiftKey: pt.shiftKey,
            button: button,
            buttons: buttons,
            pinchPx: null,
            pinchRatio: null,
            pointerDistance: null,
            rotate: null,
            rotateTotal: null,
            handled: false,
            currentGesture: currentGesture
        };
        if (triggerType == "pointerdown") {
            params.name = "pointerdown";
        }
        //only one pointer
        if (ps.length == 1) {
            let tapTol = getTapTolerance();
            if (pt.pointerType == "mouse" && tapTol > 5) {
                tapTol = tapTol / 2;
            }
            //detect tap and doubletap
            if ((currentGestureName == null) && isLast && ptTotalDist < tapTol) {
                //maximum time for "tap", more than this is "hold"
                if (pt.totalTime < 400) {
                    //better to use setTimeout so we don't fire
                    //tap and also doubletap?
                    params.name = "tap";
                    if (lastGesture) {
                        if (lastGesture.name == "tap" && !lastGesture.handled) { // && lastGesture.target == targetElement
                            let tapdur = pt.eventTime - lastGesture.eventTime;
                            if (tapdur < 350) {
                                params.name = "doubletap";
                            }
                        }
                    }
                } else {
                    params.name = "hold";
                }
            } else if (ptTotalDist > tapTol) {  //pan, swipe
                params.moveX = pt.moveX;
                params.moveY = pt.moveY;
                if (pt.pointerType != "mouse" && isLast && avgSpeed > 1.5 && gestureTime < 300) {
                    let rec1 = recentPointers[pt.pointerId];
                    params.name = "swipe";
                    params.moveX = pt.distX;
                    params.moveY = pt.distY;
                } else {
                    params.name = "pan";
                }
                //} else if (Math.abs(pt.moveX) > 0 || Math.abs(pt.moveY) > 0 || currentGestureName == "pan") {
                //    params.name = "pan";
                //} else {
                //    debugStr = "pan/swipe?";
                //}
            } else {
                //holding?
                debugStr = "holding?";
            }
        } else if (ps.length > 1) { //two pointers
            let p2 = ps[1];//second pointer
            if (recentPointers[pt.pointerId] && recentPointers[p2.pointerId]) {
                let rec1 = recentPointers[pt.pointerId];
                let rec2 = recentPointers[p2.pointerId]

                let curDist = getDist(pt, p2);
                let lastDist = getDist(rec1, rec2);
                let distChg = curDist - lastDist;
                let curCenter = { pageX: Math.round((pt.pageX + p2.pageX) / 2), pageY: Math.round((pt.pageY + p2.pageY) / 2) };
                let oldCenter = { pageX: Math.round((rec1.pageX + rec2.pageX) / 2), pageY: Math.round((rec1.pageY + rec2.pageY) / 2) };
                if (pt.moveX != 0 || pt.moveY != 0 || p2.moveX != 0 || p2.moveX != 0) {
                    params.moveX = Math.round(curCenter.pageX - oldCenter.pageX);
                    params.moveY = Math.round(curCenter.pageY - oldCenter.pageY);
                }
                params.pageX = curCenter.pageX;
                params.pageY = curCenter.pageY;
                params.pointerDistance = curDist;
                params.name = "pinch";
                let avgTime = (pt.eventTime - rec1.eventTime + p2.eventTime - rec2.eventTime) / 2;
                params.speed = Math.round(distChg / avgTime * 100) / 100;
                params.pinchPx = distChg;
                //try how far did it move vs how far did it move from the center

                let ptDist = getDist(rec1, pt);
                let p2Dist = getDist(rec2, p2);
                let totalPtDist = ptDist + p2Dist;
                params.pinchRatio = Math.abs(distChg / totalPtDist); //how much of there movement was away from each other, smaller numbers indicate less pinch
                //check for rotation
                //use angles relative to center of gesture
                //let originCtr = { x: Math.round((pt.originX + p2.originX) / 2), y: Math.round((pt.originY + p2.originY) / 2) };//midpoint of pointerdown
                //let ptAngle0 = getDir(pt.originY - originCtr.y, pt.originX - originCtr.x);//angle to pointerdown
                //let p2Angle0 = getDir(p2.originY - originCtr.y, p2.originX - originCtr.x);
                let ptAngle1 = getDir(rec1.pageY - curCenter.pageY, rec1.pageX - curCenter.pageX);//angle to last position
                let p2Angle1 = getDir(rec2.pageY - curCenter.pageY, rec2.pageX - curCenter.pageX);
                let ptAngle2 = getDir(pt.pageY - curCenter.pageY, pt.pageX - curCenter.pageX);//angle to current position
                let p2Angle2 = getDir(p2.pageY - curCenter.pageY, p2.pageX - curCenter.pageX);
                //let ptClockwise = isClockwise(ptAngle1, ptAngle2);
                //let p2Clockwise = isClockwise(p2Angle1, p2Angle2);
                let ptDiff = getAngleDiff(ptAngle1, ptAngle2);//compare last to current position
                let p2Diff = getAngleDiff(p2Angle1, p2Angle2);
                //move same direction or one didn't move
                if ((ptDiff >= 0 && p2Diff >= 0) || (ptDiff <= 0 && p2Diff <= 0)) {
                    let totalDeg = ptDiff + p2Diff;
                    let rotDeg = totalDeg / 2;
                    if (rotDeg != 0) { 
                        rotateTotal += rotDeg;
                        params.rotate = rotDeg;
                        params.rotateTotal = rotateTotal;
                    }
                }
            }
        }
        else {
            ////console.debug("more than 2 fingers");
            //return null;//could do 3 finger actions here
            params.name = "other";
        }
        if (params.name == "swipe") {
            //reset - stop gesture after swipe
            curPointers = {};
            currentGesture = null;
        }
        if (isLast) {
            //gestureStartTime = null;//endGesture
            if (params.name == null && currentGesture) {
                params.name = currentGesture.name;
            }
            if (currentGesture && !params.rotate && currentGesture.rotate) params.rotate = currentGesture.rotate;
        }

        if (!params.name) {
            debug("nogesture", [debugStr, params]);
        }

        let gEvent = params;
        lastEvent = Object.assign({}, gEvent);//clone
        if (!lastEvent.name) lastEvent.name = triggerType;
        if (params.name != "pointerdown" && params.name != "holding") { //"pointerdown" is not a gesture - ingore pointerdown so we can fire doubletap
            currentGesture = gEvent;
            if (gEvent.name) { //make sure it has a value
                lastGesture = gEvent;//only remember if it was a valid event
            }
        }

        recentPointers = {};
        if (!isLast) {
            for (let lp in curPointers) {
                recentPointers[lp] = curPointers[lp];
            }
        }
        //don't call endGesture here, the gEvent is still being handled
        return gEvent;
    }
    //gets direction in degrees, inverts Y so that 90 degrees is up
    const getDir = function (yDiff, xDiff) {
        let angleDeg = Math.atan2(-yDiff, xDiff) * (180 / Math.PI);
        if (angleDeg < 0) angleDeg = angleDeg + 360;
        return Math.round(angleDeg * 100000) / 100000;
    }
    //assumes travel in shortest distance
    const getAngleDiff = function (angle1Deg, angle2Deg) {
        let diff = angle1Deg - angle2Deg;
        if (diff < -180) diff += 360;
        if (diff > 180) diff -= 360;
        return Math.round(diff * 100000) / 100000;
    }
    //assumes travel in shortest distance
    const isClockwise = function (angle1Deg, angle2Deg) {
        let diff = angle1Deg - angle2Deg;
        if (diff < -180) diff += 360;
        let clockwise = false;
        if (diff == 0 || diff == 180) clockwise = null;
        if (diff > 0 && diff < 180) clockwise = true;
        return clockwise;
    }

    const getDist = function (p1, p2) {
        let xdelta = p2.pageX - p1.pageX;
        let ydelta = p2.pageY - p1.pageY;
        let curDist = Math.round(Math.sqrt((xdelta * xdelta) + (ydelta * ydelta)) * 100000) / 100000;
        return curDist;
    }

    const copyEvent = function (e) {
        let copy = {};
        for (let i = 0; i < pointerFields.length; i++) {
            if (typeof e[pointerFields[i]] != "undefined") {
                copy[pointerFields[i]] = e[pointerFields[i]];
            } else {
                copy[pointerFields[i]] = null;
            }
        }
        copy.totalTime = 0;//updated in 
        copy.eventTime = e.timeStamp;
        return copy;
    }

    function preventDefault(e) {
        e = e || window.event;
        if (e.preventDefault)
            e.preventDefault();
        e.returnValue = false;
    }

    function stopPropagation(e) {
        e = e || window.event;
        if (e.stopPropagation)
            e.stopPropagation();
    }

    const updatePointerEvent = function (e, last) {
        let dur = e.eventTime - last.eventTime;
        let totalTime = dur;
        if (dur == 0) dur = 0.00001;//create minimal duration in event of zero
        if (last.totalTime) totalTime += last.totalTime;
        let moveX = e.pageX - last.pageX;
        let moveY = e.pageY - last.pageY;
        let totalX = Math.abs(moveX);
        let totalY = Math.abs(moveY);
        let distX = moveX;
        let distY = moveY;
        if (last.distX) {
            distX = distX + last.distX;
            distY = distY + last.distY;
        }
        let dir = null;
        let x = moveX;
        let y = moveY;
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
        let d2 = (moveX * moveX) + (moveY * moveY);
        let speed = 0;
        if (d2 > 0) {
            speed = Math.sqrt(d2) / dur;
            //smooth out speed changes
            if (last.speed) speed = (last.speed + 4 * speed) / 5;
            speed = (Math.floor(speed * 100) / 100);
        } else {
            speed = Math.floor(e.speed * 90) / 100;
        }
        let vectorAvg = null;
        if (typeof (last.moveX) != "undefined") {
            vectorAvg = { x: (moveX + last.moveX) / 2, y: (moveY + last.moveY) / 2 };
        }
        if (vectorAvg && last.vectorAvg) {
            vectorAvg.x = (vectorAvg.x + last.vectorAvg.x) / 2;
            vectorAvg.y = (vectorAvg.y + last.vectorAvg.y) / 2;
        }
        let params = {
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
        for (let p in params) {
            e[p] = params[p];
            //Object.defineProperty(e, p, {
            //   value: params[p],
            //    writable: false
            //});
        }
        if (!e.originX && last.originX) e.originX = last.originX;
        if (!e.originY && last.originY) e.originY = last.originY;
        if (d2 == 0) //return false;//didn't move
            return true;
    }
    /* Feature detection */
    let passiveSupported = false;
    try {
        let options = {
            get passive() { // This function will be called when the browser
                //   attempts to access the passive property.
                passiveSupported = true;
            }
        };
        let nullfunc = function () { }

        window.addEventListener("test", nullfunc, options);
        window.removeEventListener("test", nullfunc, options);
    } catch (err) {
        passiveSupported = false;
    }
    const passiveOpt = passiveSupported ? { passive: false } : undefined;

    /* wire up event listeners */
    targetElement.addEventListener("wheel", function (evt) {
        debug(evt.type);
        preventDefault(evt);
        let e = copyEvent(evt);
        //console.debug("wheel d:" + evt.delta + " dx:" + evt.deltaX + " dy:" + evt.deltaY, e);
        /* Determine the direction of the scroll (< 0 ? up, > 0 ? down). */
        let evtDelta = ((evt.deltaY || -evt.wheelDelta || evt.detail)) || 0;
        let delta = evtDelta;
        //consolevt.log("mouse wheel ", evt.ctrlKey, delta); 
        //if (delta != 0 && delta < 1 && delta > -1) delta = delta * 10;
        if (delta > 0) delta = 1;
        if (delta < 0) delta = -1;
        if (evt.ctrlKey) { //pinch
            let scaleChg = delta / 10;
        }
        let gEvent = {
            target: evt.target,
            name: "wheel",
            pointers: [e],
            ended: true,
            offsetX: evt.offsetX,
            offsetY: evt.offsetY,
            pageX: evt.pageX,
            pageY: evt.pageY,
            speed: evtDelta,
            duration: 0,
            lastGesture: null,
            numEvents: 1,
            eventTime: Date.now(),
            totalDist: delta,
            altKey: evt.altKey,
            ctrlKey: evt.ctrlKey,
            shiftKey: evt.shiftKey,
            button: evt.button,
            buttons: evt.buttons,
            handled: false,
            moveX: evt.deltaX,
            moveY: evt.deltaY
        };
        if (gEvent) dispatchGesture(gEvent, false);
        return false;
    }, passiveOpt);

    targetElement.addEventListener("pointerover", function (evt) { //this is like pointerenter
        debug(evt.type);
        lastEvent = evt;
    });
    targetElement.addEventListener("pointerdown", function (evt) {
        debug(evt.type);
        preventDefault(evt);
        lastEvent = evt;
        if (!evt.pointerType) return;//some browsers fire some events with no pointer type - bug?
        let e = copyEvent(evt);
        if (e.pointerType == "mouse") {
            button = e.button;
        } else {
            button = null;
        }
        e.originX = e.pageX;
        e.originY = e.pageY;
        //e.eventTime = evt.timeStamp;
        recentPointers[e.pointerId] = e;//current state
        curPointers[e.pointerId] = e;//current state
        startGesture();
        let gEvent = createGestureEvent("pointerdown", false);
        if (gEvent) dispatchGesture(gEvent, false);
        //return false;
    });
    targetElement.addEventListener("pointermove", function (evt) {
        debug(evt.type);
        preventDefault(evt);
        lastEvent = evt;
        if (!evt.pointerType) return;
        //if (evt.buttons > 1 && evt.buttons & 1) console.warn("multi buttons", evt.buttons);
        let e = copyEvent(evt);
        //e.eventTime = evt.timeStamp;
        if (evt.pointerType == "mouse" && button == null) {
            let hEvent = createHoverEvent(e);
            if (hEvent) dispatchGesture(hEvent, true);
            //return false;
        }
        //this fires on hover, no good
        if (curPointers[e.pointerId]) curPointers[e.pointerId] = e;//set current state only if present
        let last = recentPointers[e.pointerId];
        if (last) {
            updatePointerEvent(e, last);
            let gEvent = createGestureEvent("pointermove", false);
            if (gEvent) dispatchGesture(gEvent, false);
        }
        //return false;
    });
    const ptrEnd = function (evt) {
        preventDefault(evt);
        lastEvent = evt;
        if (!evt.pointerType) {
            console.warn("No pointerType");
            return;
        }
        let e = copyEvent(evt);
        //e.eventTime = evt.timeStamp;
        let isLast = false;
        curPointers[e.pointerId] = e;
        let curAry = copyPointers(curPointers);
        if (curAry.length < 2) isLast = true;
        if (recentPointers[e.pointerId]) {
            let last = recentPointers[e.pointerId];
            updatePointerEvent(e, last);
        }
        e.ended = true;
        let gEvent = createGestureEvent("pointerend", isLast);
        //gEvent could be null if the gesture wasn't started (gestureStartTime was never set)
        debug("pointerend",gEvent);
        //if (gEvent) dispatchGesture(gEvent,false);
        curPointers[e.pointerId] = null;
        recentPointers[e.pointerId] = null;
        delete curPointers[e.pointerId];
        delete recentPointers[e.pointerId];
        if (e.pointerType == "mouse") button = null;
        if (gEvent) dispatchGesture(gEvent, false);
        if (isLast) {
            endGesture();
        }
        //return false;
    }
    targetElement.addEventListener("pointerup", function (evt) {
        debug(evt.type);
        ptrEnd(evt)
    });
    targetElement.addEventListener("pointerout", function (evt) {
        debug(evt.type);
        ptrEnd(evt);
    });
    targetElement.addEventListener("pointerleave", function (evt) {
        debug(evt.type);
        ptrEnd(evt);
    });
};

//Add support for 3D mouse
//window.addEventListener("gamepadconnected", function (e) {
//    if (e["gamepad"]["id"] && (e["gamepad"]["id"].indexOf("SpaceMouse") > -1 || e["gamepad"]["id"].indexOf("3Dconnexion") > -1)) {
//        GestureListener.GamePad = e["gamepad"]["id"]["index"];//single instance
//        //console.warn("Found gamepad");
//        setInterval(function () {
//            //_GamePad is only a snapshot, need to get current state
//            let gp = navigator.getGamepads()[GestureListener.GamePad];
//            if (gp) {

//            }
//        }, 100);
//    }
//});
