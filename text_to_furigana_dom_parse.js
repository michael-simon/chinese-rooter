﻿var userKanjiRegexp;
var includeLinkText;
var kanjiTextNodes = {};
var submittedKanjiTextNodes = {};

// fetch stored configuration values from the background script
chrome.runtime.sendMessage({ message: "config_values_request"}, function(response) {
    includeLinkText = JSON.parse(response.includeLinkText);
    persistentMode = JSON.parse(response.persistentMode);
    furiganaEnabled = JSON.parse(response.furiganaEnabled);
    autoStart = JSON.parse(response.autoStart);
    //Parse for kanji and insert furigana immediately if persistent mode is enabled
    if (persistentMode && furiganaEnabled) enableFurigana();
    if (persistentMode && autoStart){
        //waiting for dictionary to load 
        setTimeout(enableFurigana, 2000);
    }
});

/*****************
 *	Functions
 *****************/
function scanForKanjiTextNodes() {
    //Scan all text for /[\u3400-\u9FBF]/, then add each text node that isn't made up only of kanji only in the user's simple kanji list
    var xPathPattern = '//*[not(ancestor-or-self::head) and not(ancestor::select) and not(ancestor-or-self::script)and not(ancestor-or-self::ruby)' + (includeLinkText ? '' : ' and not(ancestor-or-self::a)') + ']/text()[normalize-space(.) != ""]';
    var foundNodes = {};
    try {
        var iterator = document.evaluate(xPathPattern, document.body, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        var nodeCtr = 100;
        var thisNode;
        while (thisNode = iterator.iterateNext()) {
            if (thisNode.textContent.match(/[\u3400-\u9FBF]/)) {
                foundNodes[nodeCtr] = thisNode;
            }
            nodeCtr++;
        }
    } catch (e) {
        alert('Error during XPath document iteration: ' + e);
    }
    return foundNodes;
}

function submitKanjiTextNodes(keepAllRuby) {
    var msgData = {
        message: "text_to_furiganize",
        keepAllRuby: keepAllRuby
    };
    msgData.textToFuriganize = {};
    var strLength = 0;
    for (key in kanjiTextNodes) {
        if (kanjiTextNodes[key] && kanjiTextNodes[key].data) {
            strLength += kanjiTextNodes[key].data.length;
            msgData.textToFuriganize[key] = kanjiTextNodes[key].data; 
            //reduce the nodes just to strings for passing to the background page.
            submittedKanjiTextNodes[key] = kanjiTextNodes[key];
        }
        //unset each member as done.
        delete kanjiTextNodes[key];
    }
    chrome.runtime.sendMessage(msgData, function(response) {});
}

function revertRubies() {
    var rubies = document.getElementsByTagName("RUBY");
    while (rubies.length > 0) {
        //this iterates because this item will be removed, shortening the list
        var rubyElem = rubies.item(0); 
        var newText = "";
        var childNd = rubyElem.firstChild;
        var parentNd = rubyElem.parentNode;
        while (childNd) {
            newText += childNd.nodeType == Node.TEXT_NODE ? childNd.data : (childNd.tagName != "RT" && childNd.tagName != "RP" ? childNd.textContent : "");
            childNd = childNd.nextSibling;
        }
        parentNd.replaceChild(document.createTextNode(newText), rubyElem);
        parentNd.normalize();
    }
    document.body.removeAttribute("fiprocessed");
}

function isEmpty(obj) {
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop))
            return false;
    }
    return true;
}

function toggleFurigana() {
    if (document.body.hasAttribute("fiprocessed")) {
        revertRubies();
        chrome.runtime.sendMessage({
            message: "reset_page_action_icon"
            //icon can only be changed by background page
        }, function(response) {}); 
        kanjiTextNodes = {};
    } else {
        kanjiTextNodes = scanForKanjiTextNodes();
        if (!isEmpty(kanjiTextNodes) || persistentMode) {
            document.body.setAttribute("fiprocessed", "true");
            //The background page will respond with data including a "furiganizedTextNodes" member, see below.
            submitKanjiTextNodes(false); 
        } else {
            alert("No text with kanji above your level found. Sorry, false alarm!");
        }
    }
}

function enableFurigana() {
    kanjiTextNodes = scanForKanjiTextNodes();
    if (!isEmpty(kanjiTextNodes) || persistentMode) {
        document.body.setAttribute("fiprocessed", "true");
        //The background page will respond with data including a "furiganizedTextNodes" member, see below.
        submitKanjiTextNodes(false); 
    } else {
        alert("No text with kanji found. Sorry, false alarm!");
    }
}

function disableFurigana() {
    if (document.body.hasAttribute("fiprocessed")) {
        revertRubies();
        chrome.runtime.sendMessage({
            message: "reset_page_action_icon"
            //icon can only be changed by background page
        }, function(response) {}); 
        kanjiTextNodes = {};
    }
}

function colorChineseRoots() {
  kanji_list = []
  rubies = document.getElementsByTagName('ruby');
  for (var i=0; i < rubies.length; i++) {
     ruby = rubies[i];
     rb = ruby.getElementsByTagName('rb')[0];
     kanji_list.push(rb.textContent);
  }
  chrome.runtime.sendMessage({
    message: "filter_chinese_roots",
    kanji_list: JSON.stringify(kanji_list)
  }, function(response) { kanji_list = JSON.parse(response.kanji_list); }
  );
  for (var i=0; i < rubies.length; i++) {
    ruby = rubies[i];
    rb = ruby.getElementsByTagName('rb')[0];
    if (kanji_list.indexOf(rb.textContent) != -1) {
      rb.className = 'chinese-root-style';
    } 
  }
}

function popUp(element, text) {
}

function removePopUp(element) {
}

function addChineseRootMouseovers() {
  rubies = documents.getElementsByClassName('chinese-root-style');
  rubies.addEventListener('mouseover', function(event) {
    chrome.runtime.sendMessage(({
       message: 'get_chinese_roots",
       kanji_list : JSON.stringify([ event.target.textContent ])
   , function(response) {
       popUp(event.target, response.chinese_root)
   }
  }, false);
  rubies.addEventListener('mouseout', function(event) {
       removePopUp(event.target);
   }
  }, false);
}

/*** Events ***/
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponseCallback) {
        if (request.furiganizedTextNodes) {
            for (key in request.furiganizedTextNodes) {
                if (submittedKanjiTextNodes[key]) {
                    var tempDocFrag = document.createDocumentFragment();
                    var dummyParent = document.createElement("DIV");
                    dummyParent.innerHTML = request.furiganizedTextNodes[key];
                    while (dummyParent.firstChild)
                        tempDocFrag.appendChild(dummyParent.firstChild);
                    submittedKanjiTextNodes[key].parentNode.replaceChild(tempDocFrag, submittedKanjiTextNodes[key]);
                    delete submittedKanjiTextNodes[key];
                }
            }
            if (!isEmpty(kanjiTextNodes)) {
                submitKanjiTextNodes(false);
            } else {
                colorChineseRoots();
                addChineseRootMouseovers();
                document.body.setAttribute("fiprocessed", "true");
                chrome.runtime.sendMessage({
                    message: "show_page_processed"
                }, function(response) {});
            }
        } else {
            console.log("Unexpected msg received from extension script: " + JSON.stringify(data).substr(0, 200));
        }
    }
);
