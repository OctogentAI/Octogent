#!/usr/bin/env node
/**
 * Octogent Post-Install Script
 * Copyright (c) 2024 Octogent Labs. All rights reserved.
 * Contact: Octogent@pm.me
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OCTOGENT_HOME = process.env.OCTOGENT_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.octogent');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function ensureDirectories() {
  const dirs = [
    OCTOGENT_HOME,
    path.join(OCTOGENT_HOME, 'logs'),
    path.join(OCTOGENT_HOME, 'workspace'),
    path.join(OCTOGENT_HOME, 'skills'),
    path.join(OCTOGENT_HOME, 'data')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`Created directory: ${dir}`, 'green');
    }
  });
}

function copyDefaultSkills() {
  const skillsSource = path.join(__dirname, '..', 'workspace', 'skills');
  const skillsTarget = path.join(OCTOGENT_HOME, 'skills');

  if (fs.existsSync(skillsSource)) {
    const skills = fs.readdirSync(skillsSource).filter(f => f.endsWith('.json'));
    
    skills.forEach(skill => {
      const source = path.join(skillsSource, skill);
      const target = path.join(skillsTarget, skill);
      
      if (!fs.existsSync(target)) {
        fs.copyFileSync(source, target);
        log(`Copied skill: ${skill}`, 'blue');
      }
    });
  }
}

function createDefaultConfig() {
  const configPath = path.join(OCTOGENT_HOME, 'config.json');
  
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      model: 'llama3.2:8b',
      threads: 8,
      port: 8888,
      apiKey: null,
      ollama: {
        host: 'http://localhost:11434'
      },
      groq: {
        apiKey: null
      },
      workspace: path.join(OCTOGENT_HOME, 'workspace'),
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    log(`Created default config: ${configPath}`, 'green');
  }
}

function printWelcome() {
  console.log('');
  log('   ____       _                         _   ', 'cyan');
  log('  / __ \\  ___| |_ ___   __ _  ___ _ __ | |_ ', 'cyan');
  log(' / / _\` |/ __| __/ _ \\ / _\` |/ _ \\ \'_ \\| __|', 'cyan');
  log('| | (_| | (__| || (_) | (_| |  __/ | | | |_ ', 'cyan');
  log(' \\ \\__,_|\\___|\\_\\___/ \\__, |\\___|_| |_|\\__|', 'cyan');
  log('  \\____/               |___/                 ', 'cyan');
  console.log('');
  log('  Autonomous Multi-Agent AI System', 'green');
  log('  Deployed by Octogent Labs', 'blue');
  console.log('');
}

function main() {
  printWelcome();
  
  log('Running post-install setup...', 'yellow');
  console.log('');
  
  try {
    ensureDirectories();
    copyDefaultSkills();
    createDefaultConfig();
    
    console.log('');
    log('Post-install completed successfully!', 'green');
    console.log('');
    log('Next steps:', 'yellow');
    log('  1. Run: octogent init', 'blue');
    log('  2. Run: octogent start', 'blue');
    log('  3. Open: http://localhost:8888', 'blue');
    console.log('');
    log('Documentation: https://github.com/OctogentAI/Octogent', 'cyan');
    log('Support: Octogent@pm.me', 'cyan');
    console.log('');
  } catch (error) {
    log(`Error during post-install: ${error.message}`, 'yellow');
    process.exit(1);
  }
}

main();
