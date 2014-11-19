#!/usr/bin/env node

var program = require('commander');
var request = require('request');
var cio = require('cheerio');
var mkdirp = require('mkdirp');
var fs = require('fs-extra');
var replay = require('request-replay');

function br2nl(str){
    return str.replace(/<br\s*[\/]?>/gi, "\n");
}

function getProblems(contestId, callback){
    var url = 'http://www.codeforces.com/contest/' + contestId + '/problems';
    console.log("Pending request to CodeForces (" + contestId + ")...");
    replay(request(url, function(error, response, body){
        if(!error && response.statusCode == 200){
            // page exists
            $ = cio.load(body);

            var problems = [];

            $('[problemIndex]').each(function(i, e){
                var problem = {
                    idx: $(this).attr('problemindex'),
                    name: $(this).find('.title').first().text(),
                    tests:[]
                };
                $(this).find('.sample-test').each(function(i, e1){
                    $(e1).find('.input').each(function(i, e2){
                        problem.tests.push({
                            input: br2nl($(e2).find('pre').first().html()),
                            output: br2nl($(e2).next().find('pre').first().html())
                        });
                    });
                });

                problems.push(problem);
            });

            if(problems.length == 0)
                callback(true);
            else
                callback(false, problems);
        }else{
            callback(true);
        }
    }), {retries:10}).on('replay', function(r){
        console.log('Contest download failed, retrying #' + r.number);
    });
}

program
    .version('0.0.0')
    .option('-d, --download [contest-id]', 'download a contest')
    .option('-u, --update', 'update a downloaded contest')
    .option('-t, --test [problem-index]', 'test a problem')
    .option('-a, --add [problem-index]', 'add testcase for a problem')
    .parse(process.argv);

if(program.download) {
    getProblems(program.download, function (error, problems) {
        if (!error) {
            var contest = {id: program.download, problems: problems};
            fs.outputJsonSync(program.download + '/contest.json', contest);
            problems.forEach(function (e) {
                console.log('Setting up problem ' + e.idx + '.');
                // create folders and templates
                var dir = program.download + '/' + e.idx + '/';
                mkdirp.sync(dir);
                fs.copySync('template.cpp', dir + e.idx + '.cpp');
                // creating in out files
                e.tests.forEach(function (e, i) {
                    fs.outputFileSync(dir + 'test' + i + '.in', e.input);
                    fs.outputFileSync(dir + 'test' + i + '.out', e.output);
                });
            });
            console.log("Contest folders created.");
        } else {
            console.log("Failed to obtain contest problems.");
        }
    });
}
