#!/usr/bin/env node

var program = require('commander');
var request = require('request');
var cio = require('cheerio');

function br2nl(str){
    return str.replace(/<br\s*[\/]?>/gi, "\n");
}

program
    .version('0.0.0')
    .parse(process.argv);

if(!program.args.length){
    program.help();
}else{
    var url = 'http://www.codeforces.com/contest/' + program.args[0] + '/problems';
    console.log("Pending request...");
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
                $(this).find('.sample-test').each(function(i, e){
                    $(this).find('.input').each(function(i, e){
                        problem.tests.push({
                            input: br2nl($(this).find('pre').first().html()),
                            output: br2nl($(this).next().find('pre').first().html())
                        });
                    });
                });

                problems.push(problem);
            });

            console.log(problems);
        }
    });
}