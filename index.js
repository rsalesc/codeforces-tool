#!/usr/bin/env node

var program = require('commander');
var request = require('request');
var cio = require('cheerio');
var mkdirp = require('mkdirp');
var fs = require('fs-extra');

function br2nl(str){
    return str.replace(/<br\s*[\/]?>/gi, "\n");
}

function getProblems(contestId, callback){
    var url = 'http://www.codeforces.com/contest/' + contestId + '/problems';
    console.log("Pending request to CodeForces (" + contestId + ")...");
    request(url, function(error, response, body){
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

            callback(false, problems);
        }else{
            callback(true);
        }
    });
}

program
    .version('0.0.0')
    .parse(process.argv);

if(!program.args.length){
    program.help();
}else{
    getProblems(program.args[0], function(error, problems){
        if(!error){
            problems.forEach(function(e){
                console.log('Setting up problem ' + e.idx + '.');
                // create folders and templates
                var dir = program.args[0] + '/' + e.idx + '/';
                mkdirp.sync(dir);
                fs.copySync('template.cpp', dir + e.idx + '.cpp');
                // creating in out files
                e.tests.forEach(function(e, i){
                    fs.outputFileSync(dir + 'test' + i + '.in', e.input);
                    fs.outputFileSync(dir + 'test' + i + '.out', e.output);
                });
            });
        }else{
            console.log("Failed to obtain contest problems.");
        }
    });
}