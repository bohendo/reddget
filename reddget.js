/*global require, __dirname, process*/
'use strict';


/************************************************************/
// Import and Configure Requirements
/************************************************************/


var fs = require('fs');
var Q = require('q');
var Xray = require(__dirname + '/node_modules/x-ray');
var today = new Date();
var x = new Xray();
var log = true ? console.log : function () { };


/************************************************************/
// Global vars
/************************************************************/


var nPagesToCheck = 5;
var importFolder = '/home/bo/i/';
var subreddits = [
    'netsec',
    'technology',
    'programming',
    'science'
];

var goodFlair = [
    'flair-endorsement',
    'flair-moderator'
];

var muteAuthor = [
];


/************************************************************/
// General Utility Functions
/************************************************************/


/**
  *  generates a pretty number worth displaying
  *  pad :: this Number -> String
  *  no side effects
  **/
Number.prototype.pad = function (len, padder, isBack) {
    var strum = '' + this,
        out = '',
        i;
    for (i = 0; i < len - strum.length; i++) {
        out += padder;
    }
    if (isBack) {
        return this + out;
    } else {
        return out + this;
    }
};


/**
  *  convertToFileName :: this String -> String
  *  no side effects
  **/
String.prototype.toCamelCase = function (maxlen) {
    var filename = this;
    filename = filename
        .replace(/[^a-zA-Z]+([a-z])/g, function ($1) {return $1.toUpperCase();})
        .replace(/[^a-zA-Z0-9]/g, '');
    if (filename.length > maxlen) {
        filename = filename.slice(0, maxlen);
    }
    // console.log(this, " -> ", filename);
    return filename;
};


/**
  *  unEscape :: this String -> String
  *  no side effects
  **/
String.prototype.unEscape = function () {

    return this
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#xA0;/g, ' ')
        .replace(/&#xA3;/g, '£')
        .replace(/&#xB1;/g, '+/-')
        .replace(/&#xE8;/g, 'è')
        .replace(/&#xE9;/g, 'é')
        .replace(/&#x200A;/g, '')
        .replace(/&#x200B;/g, '')
        .replace(/&#x2009;/g, ' ')
        .replace(/&#x2013;/g, '-')
        .replace(/&#x2014;/g, '-')
        .replace(/&#x2018;/g, "'")
        .replace(/&#x2019;/g, "'")
        .replace(/&#x201C;/g, '"')
        .replace(/&#x201D;/g, '"')
        .replace(/&#x2022;/g, '-')
        .replace(/&#x2026;/g, '...')
        .replace(/&#x2122;/g, '(TM)')
        .replace(/&#x2606;/g, '*')
        .replace(/&#xFEFF;/g, '');
};


/**
  *  htmlFixer :: this -> String
  *  no side effects
  **/
String.prototype.htmlFixer = function () {

    // TODO format links better
    return this
        .replace(/<\/?a[^>]*?href="([^"]*?)"[^>]*?>/g, '($1) ')
        .replace(/<\/a>/g, '')
        .replace(/<\/?p>/g, '')
        .replace(/<\/?pre>/g, '')
        .replace(/<\/?ul>/g, '')
        .replace(/<\/?ol>/g, '')
        .replace(/<\/li>/g, '')
        .replace(/<div class="md">/g, '')
        .replace(/<\/div>/g, '')
        .replace(/<code>/g, '\n<code>\n')
        .replace(/<li>/g, ' - ')
        .replace(/<br>/g, '\n')
        .replace(/<\/?em>/g, '*')
        .replace(/<\/?strong>/g, '*')
        .replace(/<\/?blockquote>/g, '"""')
        .replace(/<hr>/g, '____________________________________________________________\n')
        .replace(/<h[0-9]>/g, '\n______________________________\n\n    ')
        .replace(/<\/h[0-9]>/g, '\n______________________________\n\n');
};


/**
  *  trim :: String -> String
  *  no side effects
  **/
String.prototype.trim = function () {

    return this
        .replace(/[ \f\r\t\u000B\u0020\u00A0\u2028\u2029]+\n$/gm, '\n')
        .replace(/^[ \f\r\t\u000B\u0020\u00A0\u2028\u2029]+/gm, '')
        .replace(/\n{4,}/gm, '\n\n\n');
};


/**
  *  getWeek :: Date -> Number
  *  no side effects
  **/
Date.prototype.getWeek = function () {

    var janFirst = new Date(this.getFullYear(),0,1);
    // the number of days we missed by starting to count weeks at the first sunday of the year
    var skippedDays = 7-janFirst.getDay() === 7 ? 0 : 7-janFirst.getDay();
    // 86400000 is the number of miliseconds in day
    return Math.ceil((Math.floor((this - janFirst) / 86400000) - skippedDays) / 7);
};


/**
  *  Returns a string ie "/home/bo/n/i/16/11/24"
  *  May create new directories on the system
  **/
var getFolder = function () {
    var yearfolder = importFolder +
        String(today.getFullYear()).slice(2, 4) + '/';
    var monthfolder = yearfolder +
        (today.getMonth() + 1).pad(2, '0') + '/';
    var dayfolder = monthfolder + today.getDate().pad(2, '0') + '/';
    try {
        fs.accessSync(yearfolder);
    }
    catch (err) {
        fs.mkdirSync(yearfolder);
    }
    try {
        fs.accessSync(monthfolder);
    }
    catch (err) {
        fs.mkdirSync(monthfolder);
    }
    try {
        fs.accessSync(dayfolder);
    }
    catch (err) {
        fs.mkdirSync(dayfolder);
    }
    return dayfolder;
};


/************************************************************/
// Main Scraper Functions
/************************************************************/


/**
  *  Subreddit name -> list of links
  *  Reads from the saved list of links from today's import file
  *  If the list of links doesn't exist, scrape from the given subreddit
  **/
var scrapeIndex = function (subreddit) {
    var i, url, npages = 5, q_1 = Q.defer(), q_2 = Q.defer();
    // try to read and return the cached list of links
    try {
        q_1.resolve(JSON.parse(fs.readFileSync(getFolder() + '.' + subreddit + "-index", 'utf-8')));
    }
    catch (err) {
        // no cache, let's recursively scrape npages of this subreddit index
        scraper(npages, []).then(function (things) {
            // time to sort, write, and return our collected reddit-things
            // indexThingsPrint(things);
            things.sort(function (thing1, thing2) {
                var first, second;
                if (isNaN(thing1.score))
                    first = 0;
                else
                    first = thing1.score;
                if (isNaN(thing2.score))
                    second = 0;
                else
                    second = thing2.score;
                // 200 bonus points for stickied posts
                if (thing1.stickied)
                    first += 200;
                if (thing2.stickied)
                    second += 200;
                // 200 bonus points for posts by flaired authors
                // note that muted authors always have their flair set to false
                if (thing1.flair)
                    first += 200;
                if (thing2.flair)
                    second += 200;
                // if equal on sticky/flair/bullet then rank based on score
                return second - first;
            });
            // indexThingsPrint(things);
            // remove info used to sort the posts, just keep the links
            things = things.map(function (element) { return element.link; });
            fs.writeFileSync(getFolder() + '.' + subreddit + '-index', JSON.stringify(things) + '\n');
            q_1.resolve(things);
        });
    }
    return q_1.promise;
    // core function that scrapes a page of the subreddit and returns a bunch of reddit-things
    function scraper(pagestogo, things) {
        // cut things off if we've scraped npages
        if (pagestogo === 0) {
            q_2.resolve(things);
        }
        else {
            // construct the url to scrape
            url = 'https://www.reddit.com/r/' + subreddit;
            url += (pagestogo !== npages) ? '/?count=25&after=t3_' + things[things.length - 1].unique : "";
            // commence scraping
            x(url, 'div.thing', [{
                    link: 'a.comments@href',
                    author: '@data-author',
                    classes: '@class',
                    flair: 'span.flair@class',
                    score: 'div.score.unvoted'
                }])(function (err, data) {
                if (err)
                    console.log(err);
                // data cleanup
                data.forEach(function (item) {
                    // get the unique post name from the classes string
                    item.unique = item.classes.match(/t3_([a-z0-9]+) /)[1];
                    // convert item.flair to a boolean (does this flair match any goodFlair?)
                    item.flair = item.flair || '';
                    item.flair = item.flair.split(' ');
                    item.flair = item.flair.some(function (good) {
                        return goodFlair.indexOf(good) != -1;
                    });
                    // get rid of those stupid bullet points
                    item.score = parseInt(item.score, 10) || 0;
                    // identify sticky posts
                    item.stickied = item.classes.indexOf('stickied') !== -1;
                });
                // add to our accumulation, one less page to go
                scraper(pagestogo - 1, things.concat(data));
            });
        }
        return q_2.promise;
    }
};


/**
  *  Scrape a post!
  **/
var scrapePost = function (lol) {
    // load the cache, we'll make sure the next post we grab is a new one
    var cache, link;
    try {
        cache = fs.readFileSync(getFolder().slice(0, -9) + '.cache', 'utf-8');
    }
    catch (err) { }
    // for every link in our list of links, check if we've already scraped it
    for (var i = 0; i < lol.length; i++) {
        var unique_name = lol[i].match(/comments\/([a-zA-Z0-9]{5,7})\//)[1];
        // cache is a long string of hashes, see if this link's hash is included
        if (cache.indexOf(unique_name) === -1) {
            link = lol[i];
            break;
        }
    }
    var id = link.match(/comments\/([a-zA-Z0-9]{5,7})\//)[1]; // log(id);
    x(link, {
        post: x("div#thing_t3_" + id, {
            link: "a.title@href",
            title: "a.title",
            author: "a.author",
            score: "div.score.unvoted",
            content: "div.usertext-body@html",
            flair: "span.flair",
            sticky: "span.stickied-tagline"
        }),
        comments: x('#commentarea', 'div.entry.unvoted', [{
                author: "a.author",
                score: "span.score.unvoted",
                offspring: "a.numchildren",
                content: "div.usertext-body"
            }])
    })(function (err, page) {
        //////////////////////////////
        // abort if the page is broken
        if (err || page.pageTitle === 'Ow! -- reddit.com') {
            console.log(' Error: ' + link.substring(25, 85) + "...");
            if (err)
                console.log("scrapePost:", err);
            // add this broken one to the cache so I can move on to a page that (hopefully) works
            fs.appendFileSync(getFolder().slice(0, -9) + '.cache', id + '\n');
            return;
        }
        var comLine = "\n______________________________\n\n";
        var line = "____________________________________________________________\n\n";
        var i, winners = { first: { score: -1 }, second: { score: -1 }, third: { score: -1 } };
        //////////////////////////////
        // add default values for anything we couldn't find
        page.post.link = page.post.link || "";
        page.post.title = page.post.title || "";
        page.post.author = page.post.author || "";
        page.post.score = page.post.score || "";
        page.post.content = page.post.content || "";
        page.post.flair = page.post.flair || "";
        page.post.sticky = page.post.sticky || "";
        page.comments = page.comments || [];
        //////////////////////////////
        // Construct the post header
        page.header = line + '    (' + page.post.score + ") " + page.post.title + '\n    by ' + page.post.author;
        page.header += page.post.flair ? ' (' + page.post.flair + ')\n' : '\n';
        if (page.post.link !== link) {
            page.header += line + page.post.link + "\n" + link + "\n" + comLine + "\n";
        }
        else {
            page.header += line + page.post.link + comLine + "\n";
        }
        //////////////////////////////
        // identify the top 3 highest scoring comments
        for (i = 0; i < page.comments.length; ++i) {
            if (page.comments[i] && page.comments[i].author && page.comments[i].score && page.comments[i].content && page.comments[i].offspring) {
                // clean up the format of a few fields
                page.comments[i].score = parseInt(page.comments[i].score, 10) || 0;
                page.comments[i].offspring = parseInt(page.comments[i].offspring.slice(1), 10) || 0;
                // use ./util.js to pull the comment content straight from the html
                page.comments[i].content = page.comments[i].content.htmlFixer().unEscape().trim();
                // update our winners object accordingly
                if (page.comments[i].score && page.comments[i].score > winners.first.score) {
                    winners.third = winners.second;
                    winners.second = winners.first;
                    winners.first = page.comments[i];
                }
                else if (page.comments[i].score && page.comments[i].score > winners.second.score) {
                    winners.third = winners.second;
                    winners.second = page.comments[i];
                }
                else if (page.comments[i].score && page.comments[i].score > winners.third.score) {
                    winners.third = page.comments[i];
                }
            }
        }
        //////////////////////////////
        // construct a pretty block of comment text
        page.commentData = page.comments;
        page.comments = "";
        page.comments = '';
        page.comments += comLine + ' Comment # 1 (' + winners.first.score + ') by ';
        page.comments += winners.first.author + comLine + '\n' + winners.first.content + '\n';
        page.comments += comLine + ' Comment # 2 (' + winners.second.score + ') by ';
        page.comments += winners.second.author + comLine + '\n' + winners.second.content + '\n';
        page.comments += comLine + ' Comment # 3 (' + winners.third.score + ') by ';
        page.comments += winners.third.author + comLine + '\n' + winners.third.content + '\n';
        page.comments = page.comments.trim();
        //////////////////////////////
        // Call upon ./wgetext.js for help if this is a link post
        if (page.post.content === "") {
            wgetext(page.post.link).then(function (wgotten) {
                page.post.content = wgotten.content.trim();
                writeOut(page);
            });
        }
        else {
            page.post.content = page.post.content.htmlFixer().unEscape().trim();
            writeOut(page);
        }
        /**
         *  saves a temporary html file for debugging
         *  saves a text version of our post
         *  prints a message indicating it's success
         **/
        function writeOut(page) {
            var n = Math.floor(fs.readdirSync(getFolder()).length / subreddits.length);
            n = n === 0 ? 1 : n;
            // save the text version of this page for your viewing pleasure
            fs.writeFile(
            // file name
            getFolder() + String(n) + "-" + page.post.title.toCamelCase(18) + ".txt", 
            // file content
            page.header + page.post.content + page.comments, 
            // If things went well, add to cache so we don't re-reddget it
            function (err) { fs.appendFileSync(getFolder().slice(0, -9) + '.cache', id + '\n'); });
        }
    });
};


/**
 *  Scrapes the text from an arbirary URL (or html)
 *  scrapePost helper or standalone if isCL == true
 **/
var wgetext = function (url, isCL) {
    var q = Q.defer();
    x(url, {
        "title": 'title',
        'html': 'body@html',
        // pass the body of each p tag into x-ray to extract the links and images
        "p": x('p', [{
                text: "",
                links: ['a@href'],
                imgs: ['img@src']
            }])
    })(function (err, data) {
        if (err) {
            q.resolve({ content: err, title: "Error" });
            return;
        }
        var writeout = '';
        for (var i = 0; i < data.p.length; ++i) {
            if (data.p[i].text) {
                writeout += data.p[i].text.replace(/\u00a0/g, ' ') + '\n';
            }
            // uncomment to add links or images
            // if (data.p[i].links.length > 0) for (var j = 0; j < data.p[i].links.length; ++j) writeout += '[' + j + ']' + data.p[i].links[j] + '\n';
            // if (data.p[i].imgs.length > 0) for (var k = 0; k < data.p[i].imgs.length; ++k) writeout += '[' + k + ']' + data.p[i].imgs[k] + '\n';
            writeout += "\n";
        }
        writeout = writeout || "";
        // isCL - are we calling wgetext directly from the command line?
        if (isCL) {
            // fs.writeFileSync(getFolder() + filename + ".html", data.html);
            fs.writeFileSync(getFolder() + data.title.toCamelCase() + ".txt", writeout);
            console.log(" " + getFolder() + data.title.toCamelCase() + ".txt");
        }
        else {
            q.resolve({ content: writeout, title: data.title });
            return;
        }
    });
    return q.promise;
};


/************************************************************/
// MAIN FUNCTION
/************************************************************/


// no arg: scrape 1 post from each subreddit
if (process.argv[2] === undefined) {
    var n = Math.floor(fs.readdirSync(getFolder()).length / subreddits.length);
    process.stdout.write(" Scraping post #" + n + " from each Subreddit... ");
    var indexQs = subreddits.map(function (sub) { return scrapeIndex(sub); });
    Q.all(indexQs).then(function (indices) {
        var postQs = indices.map(function (index) { return scrapePost(index); });
        Q.all(postQs).then(function (posts) {
            console.log("Success!");
        });
    });
}
else if (process.argv[2].slice(0, 4) === 'http') {
    wgetext(process.argv[2], true);
}
else if (process.argv[2] === "prep") {
    process.stdout.write(" Saving Index for each Subreddit... ");
    var indices = subreddits.map(function (sub) { return scrapeIndex(sub); });
    Q.all(indices).then(function () {
        console.log("Success");
    });
}
else {
    console.log(' idk what you want me to do');
}
