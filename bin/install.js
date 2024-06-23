// Cronicle Auto Installer
// Copyright (c) 2015 - 2023 Joseph Huckaby, MIT License.
// https://github.com/jhuckaby/Cronicle

// To install, issue this command as root:
// curl -s "https://raw.githubusercontent.com/jhuckaby/Cronicle/master/bin/install.js" | node

var path = require('path');
var fs = require('fs');
var util = require('util');
var os = require('os');
var cp = require('child_process');

var installer_version = '1.4';
var base_dir = '/opt/cronicle';
var log_dir = base_dir + '/logs';
var log_file = '';
var gh_repo_url = 'http://github.com/jhuckaby/Cronicle';
//var gh_releases_url = 'https://api.github.com/repos/jhuckaby/Cronicle/releases';
//var gh_head_tarball_url = 'https://github.com/jhuckaby/Cronicle/archive/master.tar.gz';

// don't allow npm to delete these (ugh)
var packages_to_check = ['couchbase', 'redis', 'ioredis', 'ioredis-timeout', 'sqlite3'];
var packages_to_rescue = {};

var restore_packages = function() {
	// restore packages that npm killed during upgrade
	var cmd = "npm install";
	var num_found = 0;
	for (var pkg in packages_to_rescue) {
		cmd += ' ' + pkg + '@' + packages_to_rescue[pkg];
		num_found++;
	}
	if (!num_found) return; // nothing to restore
	if (log_file) {
		fs.appendFileSync(log_file, "\nExecuting npm command to restore lost packages: " + cmd + "\n");
		cmd += ' >>' + log_file + ' 2>&1';
	}
	cp.execSync(cmd);
};

var print = function(msg) { 
	process.stdout.write(msg); 
	if (log_file) fs.appendFileSync(log_file, msg);
};
var warn = function(msg) { 
	process.stderr.write(msg); 
	if (log_file) fs.appendFileSync(log_file, msg);
};
var die = function(msg) {
	warn( "\nERROR: " + msg.trim() + "\n\n" );
	process.exit(1);
};
var logonly = function(msg) {
	if (log_file) fs.appendFileSync(log_file, msg);
};

if (process.getuid() != 0) {
	die( "The Cronicle auto-installer must be run as root." );
}

// create base and log directories
try { cp.execSync( "mkdir -p " + base_dir + " && chmod 775 " + base_dir ); }
catch (err) { die("Failed to create base directory: " + base_dir + ": " + err); }

try { cp.execSync( "mkdir -p " + log_dir + " && chmod 777 " + log_dir ); }
catch (err) { die("Failed to create log directory: " + log_dir + ": " + err); }

// start logging from this point onward
log_file = log_dir + '/install.log';
logonly( "\nStarting install run: " + (new Date()).toString() + "\n" );

print( 
	"\nCronicle Installer v" + installer_version + "\n" + 
	"Copyright (c) 2015 - 2022 PixlCore.com. MIT Licensed.\n" + 
	"Log File: " + log_file + "\n\n" 
);

process.chdir( base_dir );

var is_preinstalled = false;
var cur_version = '';
var new_version = process.argv[2] || '';

try {
	var stats = fs.statSync( base_dir + '/package.json' );
	var json = require( base_dir + '/package.json' );
	if (json && json.version) {
		cur_version = json.version;
		is_preinstalled = true;
	}
}
catch (err) {;}

var is_running = false;
if (is_preinstalled) {
	var pid_file = log_dir + '/cronicled.pid';
	try {
		var pid = fs.readFileSync(pid_file, { encoding: 'utf8' });
		is_running = process.kill( pid, 0 );
	}
	catch (err) {;}
}


	
	if (is_running) {
		print("\n");
		try { cp.execSync( base_dir + "/bin/control.sh stop", { stdio: 'inherit' } ); }
		catch (err) { die("Failed to stop Cronicle: " + err); }
		print("\n");
	}




	
		
		try {
			var stats = fs.statSync( base_dir + '/package.json' );
			var json = require( base_dir + '/package.json' );
		}
		catch (err) {
			die("Failed to download package: " + tarball_url + ": " + err);
		}
		
		print( is_preinstalled ? "Updating dependencies...\n" : "Installing dependencies...\n");
		
		var npm_cmd = is_preinstalled ? "npm update --unsafe-perm" : "npm install --unsafe-perm";
		logonly( "Executing command: " + npm_cmd + "\n" );
		
		// temporarily stash add-on modules that were installed separately (thanks npm)
		if (is_preinstalled) packages_to_check.forEach( function(pkg) {
			if (fs.existsSync('node_modules/' + pkg)) {
				packages_to_rescue[pkg] = JSON.parse( fs.readFileSync('node_modules/' + pkg + '/package.json', 'utf8') ).version;
			}
		});
		
		// install dependencies via npm
		cp.exec(npm_cmd, function (err, stdout, stderr) {
			if (err) {
				print( stdout.toString() );
				warn( stderr.toString() );
				if (is_preinstalled) restore_packages();
				die("Failed to install dependencies: " + err);
			}
			else {
				logonly( stdout.toString() + stderr.toString() );
			}
			
			print("Running post-install script...\n");
			logonly( "Executing command: node bin/build.js dist\n" );
			
			// finally, run postinstall script
			cp.exec('node bin/build.js dist', function (err, stdout, stderr) {
				if (is_preinstalled) {
					// for upgrades only print output on error
					if (err) {
						print( stdout.toString() );
						warn( stderr.toString() );
						if (is_preinstalled) restore_packages();
						die("Failed to run post-install: " + err);
					}
					else {
						if (is_preinstalled) restore_packages();
						print("Upgrade complete.\n\n");
						
						if (is_running) {
							try { cp.execSync( base_dir + "/bin/control.sh start", { stdio: 'inherit' } ); }
							catch (err) { die("Failed to start Cronicle: " + err); }
							print("\n");
						}
					}
				} // upgrade
				else {
					// first time install, always print output
					print( stdout.toString() );
					warn( stderr.toString() );
					
					if (err) {
						die("Failed to run post-install: " + err);
					}
					else {
						print("Installation complete.\n\n");
					}
				} // first install
				
				logonly( "Completed install run: " + (new Date()).toString() + "\n" );
				
				process.exit(0);
			} ); // build.js
		} ); // npm
