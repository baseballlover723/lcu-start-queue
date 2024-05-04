import LcuPlugin from 'lcu-plugin';
import axios from 'axios';

const CURRENT_SUMMONER_ENDPOINT = 'lol-summoner/v1/current-summoner';
const PARTY_ENDPOINT = 'lol-lobby/v1/parties/player';
const LOBBY_ENDPOINT = 'lol-lobby/v2/lobby';
const MEMBERS_ENDPOINT = 'lol-lobby/v2/lobby/members';
const LOBBY_MATCHMAKING_SEARCH_ENDPOINT = 'lol-lobby/v2/lobby/matchmaking/search';
const CONVERSATIONS_EVENT = 'OnJsonApiEvent_lol-chat_v1_conversations';

const PARTY_RESTRICTION_QUEUES = new Set([490]); // QuickPlay

export default class StartQueueLcuPlugin extends LcuPlugin {
  onConnect(clientData) {
    axios.defaults.baseURL = `${clientData.protocol}://${clientData.address}:${clientData.port}`;
    axios.defaults.auth = { username: clientData.username, password: clientData.password };
    return this.createPromise((resolve, reject) => {
      this.getCurrentSummoner().then((summonerId) => {
        this.subscribeEvent(CONVERSATIONS_EVENT, this.handleLobbyChat(summonerId));
        this.log('is ready');
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  getCurrentSummoner(retriesLeft = 20) {
    return this.createPromise((resolve, reject) => {
      this.getCurrentSummonerHelper(retriesLeft, resolve, reject);
    });
  }

  getCurrentSummonerHelper(retriesLeft, resolve, reject) {
    axios.get(CURRENT_SUMMONER_ENDPOINT).then((resp) => {
      resolve(resp.data.summonerId);
    }).catch((error) => {
      if ((error.code !== 'ECONNREFUSED' && error?.response?.status >= 500) || retriesLeft <= 0) {
        this.log('error in getting current summoner', error);
        reject(error);
      }
      setTimeout(() => {
        this.getCurrentSummonerHelper(retriesLeft - 1, resolve, reject);
      }, 1000);
    });
  }

  async startQueue() {
    return axios.post(LOBBY_MATCHMAKING_SEARCH_ENDPOINT)
      .catch((error) => this.error(error));
  }

  async getLobbyMembers() {
    return axios.get(MEMBERS_ENDPOINT);
  }

  amLeader(currentSummonerId, players) {
    return players.data.some((player) => currentSummonerId === player.summonerId && player.isLeader);
  }

  getLobby() {
    return axios.get(LOBBY_ENDPOINT);
  }

  getParty() {
    return axios.get(PARTY_ENDPOINT);
  }

  handleLobbyChat(currentSummonerId) {
    return async (event) => {
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

      const players = await this.getLobbyMembers();
      if (!this.amLeader(currentSummonerId, players)) {
        this.log('Ignoring since I am not party leader');
        return;
      }

      const lobby = await this.getLobby();
      if (PARTY_RESTRICTION_QUEUES.has(lobby.data.gameConfig.queueId)) {
        const party = await this.getParty();
        if (party.data.currentParty.eligibilityRestrictions.length !== 0) {
          this.log("Can't start queue");
          return;
        }
      } else if (!lobby.data.canStartActivity) {
        this.log("Can't start queue");
        return;
      }

      await this.startQueue();
    };
  }
}
