import LCUPlugin from 'lcu-plugin';
import axios from 'axios';

const LOBBY_MATCHMAKING_SEARCH_ENDPOINT = 'lol-lobby/v2/lobby/matchmaking/search';
const CONVERSATIONS_EVENT = 'OnJsonApiEvent_lol-chat_v1_conversations';

export default class StartQueueLcuPlugin extends LCUPlugin {
  onConnect(clientData) {
    axios.defaults.baseURL = `${clientData.protocol}://${clientData.address}:${clientData.port}`;
    axios.defaults.auth = { username: clientData.username, password: clientData.password };
    this.subscribeEvent(CONVERSATIONS_EVENT, this.handleLobbyChat);
    this.log('is ready');
  }

  async startQueue() {
    return axios.post(LOBBY_MATCHMAKING_SEARCH_ENDPOINT)
      .catch((error) => this.error(error));
  }

  async handleLobbyChat(event) {
    if (event.eventType !== 'Create') {
      return;
    }
    // this.log('received party chat: ', event);
    if (event.data.type !== 'groupchat') {
      return;
    }
    // this.log('received party chat: ', event);
    if (!/start/i.test(event.data.body)) {
      // this.log(`startQueuePlugin ignoring message "${event.data.body}" because it didn't match the regex`);
      return;
    }
    await this.startQueue();
  }
}
