var dicfiles = ['char.category', 'code2category', 'word2id', 'word.dat', 'word.ary.idx', 'word.inf', 'matrix.bin'];
var tagger = null;
var furiganized = {};
var exceptions = null;
var furiganaEnabled = false;
var roots = null;

//initialize variables
if (!localStorage)
    console.log("Error: localStorage not available to background page. Has local storage been disabled in this instance of Chrome?");

//initialize local storage
var localStoragePrefDefaults = {
    "include_link_text": true,
    "furigana_display": "hira",
    "filter_okurigana": true,
    "persistent_mode": false,
    "yomi_size": "",
    "yomi_color": "",
    "auto_start": false
}

for (var key in localStoragePrefDefaults) {
    if (localStorage.getItem(key) === null) {
        console.log("The localStorage \"" + key + "\" value was null. It will be initialised to" + localStoragePrefDefaults[key] + ".");
        localStorage.setItem(key, localStoragePrefDefaults[key]);
    }
}

//initialize IGO-JS
igo.getServerFileToArrayBufffer("res/ipadic.zip", function(buffer) {
    try {
        var blob = new Blob([new Uint8Array(buffer)]);
        var reader = new FileReader();
        reader.onload = function(e) {
            var dic = Zip.inflate(new Uint8Array(reader.result))
            tagger = loadTagger(dic);
        }
        reader.readAsArrayBuffer(blob);
    } catch (e) {
        console.error(e.toString());
    }
});

$.getJSON("res/exceptions.json", function(data) {
    exceptions = data;
});

$.getJSON("res/yomi-data.json", function(data) {
    roots = data;
});

/*****************
 *  Functions
 *****************/
//load dictionaries
function loadTagger(dicdir) {
    var files = new Array();
    for (var i = 0; i < dicfiles.length; ++i) {
        files[dicfiles[i]] = dicdir.files[dicfiles[i]].inflate();
    }

    var category = new igo.CharCategory(files['code2category'], files['char.category']);
    var wdc = new igo.WordDic(files['word2id'], files['word.dat'], files['word.ary.idx'], files['word.inf']);
    var unk = new igo.Unknown(category);
    var mtx = new igo.Matrix(files['matrix.bin']);
    return new igo.Tagger(wdc, unk, mtx);
}
//prepare a tab for furigana injection
function enableTabForFI(tab) {
    chrome.pageAction.setIcon({
        path: {
            "19": "img/icons/furigana_inactive_38.png",
            "38": "img/icons/furigana_inactive_76.png"
        },
        tabId: tab.id
    });
    chrome.pageAction.setTitle({
        title: "Insert furigana",
        tabId: tab.id
    });
    chrome.pageAction.show(tab.id);
    chrome.tabs.executeScript(tab.id, {
        file: "text_to_furigana_dom_parse.js"
    });
}

/*****************
 *  Chrome events
 *****************/

//Page action listener
chrome.pageAction.onClicked.addListener(function(tab) {
    if (JSON.parse(localStorage.getItem('persistent_mode')) == true) {
        chrome.tabs.query({} ,function (tabs) {
            for (var i = 0; i < tabs.length; i++) {
                chrome.tabs.executeScript(tabs[i].id, {code: "toggleFurigana();"});
            }
        });
    } else {
        chrome.tabs.executeScript(tab.id, {
            code: "toggleFurigana();"
        });
    }
});

//Keyboard action listener
chrome.commands.onCommand.addListener(function(command) {
    if (JSON.parse(localStorage.getItem('persistent_mode')) == true) {
        chrome.tabs.query({} ,function (tabs) {
            for (var i = 0; i < tabs.length; i++) {
                chrome.tabs.executeScript(tabs[i].id, {code: "toggleFurigana();"});
            }
        });
    } else {
        chrome.tabs.executeScript(tab.id, {
            code: "toggleFurigana();"
        });
    }
});

//Ruby tag injector
function addRuby(furiganized, kanji, yomi, key, processed) {
    //furigana can be displayed in either hiragana, katakana or romaji
    switch (localStorage.getItem("furigana_display")) {
        case "hira":
            yomi = wanakana.toHiragana(yomi);
            break;
        case "roma":
            yomi = wanakana.toRomaji(yomi);
            break;
        default:
            break;
    }

    ruby_rxp = new RegExp(sprintf('<ruby><rb>%s<\\/rb><rp>\\(<\\/rp><rt[ style=]*.*?>([\\u3040-\\u3096|\\u30A1-\\u30FA|\\uFF66-\\uFF9D|\\u31F0-\\u31FF]*)<\\/rt><rp>\\)<\\/rp><\\/ruby>', kanji), 'g');

    //apply user styles to furigana text
    yomi_size = '';
    yomi_color = '';

    localStorage.getItem('yomi_size').length > 0 ? yomi_size = sprintf('font-size:%spt', localStorage.getItem('yomi_size')) : yomi_size = '';
    localStorage.getItem('yomi_color').length > 0 ? yomi_color = sprintf(';color:%s', localStorage.getItem('yomi_color')) : yomi_color = '';

    yomi_style = yomi_size + yomi_color;

    //inject furigana into text nodes
    //a different regex is used for repeat passes to avoid having multiple rubies on the same base
    if (processed.indexOf(kanji) == -1) {
        processed += kanji;
        if (furiganized[key].match(ruby_rxp)) {
            furiganized[key] = furiganized[key].replace(ruby_rxp, sprintf('<ruby><rb>%s</rb><rp>(</rp><rt style="%s">%s</rt><rp>)</rp></ruby>', kanji, yomi_style, yomi));
        } else {
            bare_rxp = new RegExp(kanji, 'g');
            furiganized[key] = furiganized[key].replace(bare_rxp, sprintf('<ruby><rb>%s</rb><rp>(</rp><rt style="%s">%s</rt><rp>)</rp></ruby>', kanji, yomi_style, yomi));
        }
    }
}


function filterChineseRoots(kanji_list) {
  chineseRoots = []
  for (var i=0; i < kanji_list.length; i++) {
    if (kanji_list[i] in roots) {
      chineseRoots.push(kanji_list[i]);
    }
  }
  return chineseRoots;
}

//Extension requests listener. Handles communication between extension and the content scripts
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponseCallback) {
        //send config variables to content script
        if (request.message == "config_values_request") {
            sendResponseCallback({
                includeLinkText: localStorage.getItem("include_link_text"),
                persistentMode: localStorage.getItem("persistent_mode"),
                autoStart: localStorage.getItem("auto_start"),
                furiganaEnabled: furiganaEnabled
            });
        //prepare tab for injection
        } else if (request.message == "init_tab_for_fi") {
            enableTabForFI(sender.tab);
        //process DOM nodes containing kanji and insert furigana
        } else if (request.message == 'text_to_furiganize') {
            furiganized = {};
            for (key in request.textToFuriganize) {
                furiganized[key] = request.textToFuriganize[key];
                tagged = tagger.parse(request.textToFuriganize[key]);

                processed = '';
                // override numeric term (dates, ages etc) readings
                // TODO: implement override
                var numeric = false;
                var numeric_yomi = exceptions;
                var numeric_kanji = '';

                tagged.forEach(function(t) {
                    if (t.surface.match(/[\u3400-\u9FBF]/)) {
                        kanji = t.surface;
                        yomi = t.feature.split(',')[t.feature.split(',').length - 2];

                        //filter okurigana (word endings)
                        if (JSON.parse(localStorage.getItem("filter_okurigana"))) {
                            diff = JsDiff.diffChars(kanji, wanakana.toHiragana(yomi));
                            kanjiFound = false;
                            yomiFound = false;
                            //separate kanji and kana characters in the string using diff
                            //and inject furigana only into kanji part
                            diff.forEach(function(part) {
                                if (part.added) {
                                    yomi = wanakana.toKatakana(part.value);
                                    yomiFound = true;
                                }
                                if (part.removed) {
                                    kanji = part.value;
                                    kanjiFound = true;
                                }
                                if (kanjiFound && yomiFound) {
                                    addRuby(furiganized, kanji, yomi, key, processed);
                                    kanjiFound = false;
                                    yomiFound = false;
                                }
                            });
                        } else {
                            addRuby(furiganized, kanji, yomi, key, processed);
                        }
                    }
                });
            }
            //send processed DOM nodes back to the tab content script
            chrome.tabs.sendMessage(sender.tab.id, {
                furiganizedTextNodes: furiganized
            });
            furiganaEnabled = true;
        //update page icon to 'enabled'
        } else if (request.message == "show_page_processed") {
            chrome.pageAction.setIcon({
                path: {
                    "19": "img/icons/furigana_active_38.png",
                    "38": "img/icons/furigana_active_76.png"
                },
                tabId: sender.tab.id
            });
            chrome.pageAction.setTitle({
                title: "Remove furigana",
                tabId: sender.tab.id
            });
        //update page icon to 'disabled'
        } else if (request.message == "reset_page_action_icon") {
            chrome.pageAction.setIcon({
                path: {
                    "19": "img/icons/furigana_inactive_38.png",
                    "38": "img/icons/furigana_inactive_76.png"
                },
                tabId: sender.tab.id
            });
            chrome.pageAction.setTitle({
                title: "Insert furigana",
                tabId: sender.tab.id
            });
            furiganaEnabled = false;
        } else if (request.message == "filter_chinese_roots") {
          kanji_list = filterChineseRoots(JSON.parse(request.kanji_list));
          sendResponseCallback({
            kanji_list: JSON.stringify(kanji_list)
          });
        } else {
            console.log("Programming error: a request with the unexpected \"message\" value \"" + request.message + "\" was received in the background page.");
        }
    }
);
