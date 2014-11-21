#!/usr/bin/env node

var program = require('commander');
var request = require('request');
var cio = require('cheerio');
var mkdirp = require('mkdirp');
var fs = require('fs-extra');
var replay = require('request-replay');
var deasync  = require('deasync');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var glob = require('glob');
var path = require('path');
var colors = require('colors');

var rlsync = require('readline-sync');

const MAX_DEPTH = 5;
const CFG_PATH = __dirname + "/config.json";

function execSync(){
    var done = false;
    var ret;
    var cb_s = function(err, stdout, stderr){
        ret = {err: err, stdout: stdout, stderr: stderr};
        done = true;
    };
    var args = Array.prototype.slice.call(arguments);
    args.push(cb_s);
    exec.apply(null, args);

    while(!done) deasync.runLoopOnce();
    return ret;
}

function br2nl(str){
    return str.replace(/<br\s*[\/]?>/gi, "\n");
}

function wc(str, obj){
    for(key in obj){
        str = str.replace("%{" + key + "}", obj[key]);
    }
    return str;
}

function findContestDir(){
	var dir = "";
	var depth = 0;
	while(!fs.existsSync(dir + "contest.json") && depth < MAX_DEPTH){
		dir += "../";
		depth++;
	}
	if(depth >= MAX_DEPTH) return false;
	return dir;
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
    .option('-d, --download [contest-id]', 'download a contest') // done
    .option('-u, --update', 'update a downloaded contest')
    .option('-t, --test [problem-index]', 'test a problem') // done
    .option('-a, --add [problem-index]', 'add testcase for a problem')
    .option("-c, --config", "config tool parameters")
    .parse(process.argv);

var cfg = (function(){
    return fs.readJsonFileSync(CFG_PATH);
})();

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
                fs.copySync('template.' + cfg.extension, dir + e.idx + '.' + cfg.extension);
                // creating in out files
                e.tests.forEach(function (e, i) {
                    fs.outputFileSync(dir + 'test' + i + '.in', e.input);
                    fs.outputFileSync(dir + 'test' + i + '.out', e.output);
                });
            });
            console.log("Contest folders created.");
        } else {
            console.log("Failed to obtain contest problems.".red);
        }
    });
}else{
	var cd = findContestDir();
    var contest = fs.readJsonFileSync(cd + 'contest.json');
	if(cd !== false){
		if(program.test){
			var idx = program.test;
			var pdir = cd + idx + '/';
			//var cpp = pdir + idx + '.' + cfg.extension;
			
			var tests = [];
			// pega os testes

            var tfiles = glob.sync('*.in', {cwd: pdir});

            tfiles.forEach(function(e, i) {
                var test = {input: fs.readFileSync(pdir + e, 'utf8'), testname: path.basename(e, '.in')};
                if(fs.existsSync(pdir + test.testname + '.out')) test.output = fs.readFileSync(pdir + test.testname + '.out', 'utf8');
                tests.push(test);
            });

			var gpp = execSync(wc(cfg.compilation, {file: idx + '.' + cfg.extension}), {cwd: pdir});
            if(gpp.stderr.length > 0) console.log(gpp.stderr);
            if(!gpp.err){
                console.log("Compiled successfully.".green);
                // compilado com suxexo
                // partiu executar o breguete
                tests.forEach(function(e, i){
                    console.log(colors.yellow("Executing test #" + i + " (" + e.testname + ".in)..."));
                    // run sh to test
                    var aout = execSync('./a.out < ' + e.testname + '.in', {cwd: pdir});
                    var input = fs.readFileSync(pdir + e.testname + '.in', 'utf8');
                    var output = false;
                    if(fs.existsSync(pdir + e.testname + '.out')) output = fs.readFileSync(pdir + e.testname + '.out', 'utf8');
                    if(aout.err) {
                        if (aout.stdout.length != 0) console.log(aout.stdout);
                        console.log(aout.err.toString().red);
                    }else {
                        console.log('Input'.magenta);
                        console.log(input);
                        console.log('Output'.magenta);
                        console.log(aout.stdout);
                    }
                    if(output){
                        console.log('Expected Output:'.magenta);
                        console.log(output);
                    }
                    if(i != tests.length-1) rlsync.question('Press any key to continue...');
                });
            }else{
                console.log("Compilation error.".red);
            }
		}else if(program.update){
            getProblems(contest.id, function (error, problems) {
                if (!error) {
                    var contest = {id: program.download, problems: problems};
                    fs.outputJsonSync(program.download + '/contest.json', contest);
                    problems.forEach(function (e) {
                        console.log('Updating problem ' + e.idx + '.');
                        // create folders and templates
                        var dir = program.download + '/' + e.idx + '/';
                        mkdirp.sync(dir);
                        // fs.copySync('template.cpp', dir + e.idx + '.cpp');
                        // creating in out files
                        e.tests.forEach(function (e, i) {
                            fs.outputFileSync(dir + 'test' + i + '.in', e.input);
                            fs.outputFileSync(dir + 'test' + i + '.out', e.output);
                        });
                    });
                    console.log("Contest folders updated.");
                } else {
                    console.log("Failed to obtain contest problems.".red);
                }
            });
        }else if(program.add){
            var idx = program.add;
            var pdir = cd + idx + '/';
            var i = 0;
            while(fs.existsSync(pdir + 'test' + i + '.in')) i++;
            var basen = pdir + 'test' + i;
            exec(cfg.editor + ' ' + basen + '.in');
            exec(cfg.editor + ' ' + basen + '.out');
        }else if(program.config){
            execSync('xdg-open ' + CFG_PATH);
        }
	}else{
		// package.json not found
        console.log("Constest.json file not found in working directory.".red);
	}
}
