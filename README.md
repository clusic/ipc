# IPC channel process controller

IPC 信息通道管理模型。

## Install

```shell
npm i @clusic/ipc
```

## Usage

```javascript
const IPC = require('@clusic/ipc');
module.exports = class Master extends IPC {
  constructor() {
    super();
    this.on('message', (msg, socket) => {
      // ...
    })
  }
}
```

## API

### ipc.register(name, agent)

```javascript
const agent = ChildProcess.fork('./agent.js');
const IPC = require('@clusic/ipc');
const ipc = new IPC();
ipc.register('agent', agent);
```

### ipc.send(to, action, body, socket)

```javascript
const agent = ChildProcess.fork('./agent.js');
const IPC = require('@clusic/ipc');
const ipc = new IPC();
ipc.register('agent', agent);
ipc.send('master', 'test:action', { a: 1, b: 2 });
```