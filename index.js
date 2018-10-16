const cluster = require('cluster');
const { EventEmitter } = require('events');

const [install, onMessage, workers, agents, pid, type, collect, sending] = [
  Symbol('ipc#install'),
  Symbol('ipc#message.listener'),
  Symbol('ipc#process.workers'),
  Symbol('ipc#process.agents'),
  Symbol('ipc#process.pid'),
  Symbol('ipc#process.type'),
  Symbol('ipc#process.collect'),
  Symbol('ipc#process.sending')
];

module.exports = class IPC extends EventEmitter {
  constructor(isAgent) {
    super();
    this[workers] = [];
    this[agents] = {};
    this[pid] = process.pid;
    this[type] = isAgent ? 'agent' : (cluster.isMaster ? 'master' : (cluster.isWorker ? 'worker': 'agent'));
    this[install]();
    this[onMessage](process);
  }
  
  get workers() {
    return this[workers];
  }
  
  get agents() {
    return this[agents];
  }
  
  register(name, agent) {
    if (this[type] !== 'master') return this;
    this[agents][name] = agent;
    this[onMessage](agent);
    return this;
  }
  
  send(to, action, body, socket) {
    if (!Array.isArray(to)) to = [to];
    if (this[type] === 'master') {
      const workers = this[collect](to, this[pid]);
      return this[sending](workers, {
        action, body,
        from: this[pid],
        to: workers.map(p => (p.process || p).pid)
      }, socket);
    }
    process.send({
      to, action, body,
      transfer: true,
      from: this[pid]
    }, socket);
    return this;
  }
  
  [install]() {
    if (this[type] !== 'master') return;
    cluster.on('fork', worker => {
      this[workers].push(worker);
      this[onMessage](worker);
    });
    cluster.on('exit', worker => {
      const index = this[workers].indexOf(worker);
      if (index > -1) this[workers].splice(index, 1);
      if (worker[onMessage]) {
        worker.removeListener('message', worker[onMessage]);
      }
    });
  }
  
  [collect](includeProcesses, excludeProcessId = 0) {
    const result = [];
    for (let i = 0, j = includeProcesses.length; i < j; i++) {
      if (typeof includeProcesses[i] === 'string') {
        switch (includeProcesses[i]) {
          case 'master': result.push(process); break;
          case 'agents': result.push(...Object.values(this[agents])); break;
          case 'workers': result.push(...this[workers]); break;
          case '*':
            result.push(process);
            result.push(...this[workers]);
            result.push(...Object.values(this[agents]));
            break;
          default:
            if (this[agents][includeProcesses[i]]) {
              result.push(this[agents][includeProcesses[i]]);
            }
        }
      } else if (typeof includeProcesses[i] === 'number') {
        const _agents = Object.values(this[agents]).filter(ag => ag.pid === includeProcesses[i]);
        const _workers = this[workers].filter(wk => wk.process.pid === includeProcesses[i]);
        if (_workers.length) result.push(..._workers);
        if (_agents.length) result.push(..._agents);
      }
    }
    return Array
    .from(new Set(result))
    .filter(pos => (pos.process || pos).pid !== excludeProcessId);
  }
  
  [onMessage](child) {
    child[onMessage] = (msg, socket) => {
      if (typeof msg === 'string') {
        if (msg === 'message') throw new Error('You can not define `message` on message channel.');
        return this.emit(msg, socket);
      }
      if (this[type] !== 'master' && msg.to.indexOf(this[pid]) > -1) return this.emit('message', msg, socket);
      if (this[type] === 'master') {
        const pools = this[collect](msg.to, msg.from);
        const index = pools.indexOf(process);
        if (pools.indexOf(process) > -1) {
          pools.splice(index, 1);
          this.emit('message', msg, socket);
        }
        if (msg.transfer && pools.length) {
          msg.to = pools.map(p => (p.process || p).pid);
          this[sending](pools, msg, socket);
        }
      }
    };
    child.on('message', child[onMessage]);
  }
  
  [sending](to, msg, socket) {
    for (let i = 0; i < to.length; i++) {
      to[i].send(msg, socket);
    }
  }
};