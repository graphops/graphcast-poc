import { EthClient } from '../../ethClient';
import path from 'path'
import fetch from "isomorphic-fetch";
import { Messenger } from '../../messenger';
import { domain, NPOIMessage, poiMessageValues, types } from '../../examples/poi-crosschecker/poi-helpers';
import { Observer } from '../../observer';
import RadioFilter from '../../radio-common/customs';
import { createClient } from '@urql/core';

declare const ETH_NODE
declare const RADIO_OPERATOR_PRIVATE_KEY
declare const REGISTRY_SUBGRAPH

let messenger;
let observer;
let ethClient;
let block;
let radioFilter;
let registryClient;
const setup = async () => {
    Date.now = jest.fn(() => Date.parse('2022-01-01'))

    messenger = new Messenger();
    observer = new Observer();
    ethClient = new EthClient(`http://${ETH_NODE}`, RADIO_OPERATOR_PRIVATE_KEY);
    await messenger.init();
    await observer.init();
    radioFilter = new RadioFilter();
    registryClient = createClient({
        url: REGISTRY_SUBGRAPH,
        fetch,
      });
        
    block = {
        number: 1,
        hash: "0x0001",
    }
}

describe('Messenger and Observer helpers', () => {
    beforeAll(setup)
    describe('Write and Observe', () => {
        test('write and observe a message - success', async () => {
            const rawMessage = {
                subgraph: "Qmaaa",
                nPOI: "poi0"
            }

            const encodedMessage = await messenger.writeMessage(ethClient, rawMessage, domain, types, block)
            expect(encodedMessage).toBeDefined()
            
            const message = observer.readMessage(encodedMessage)
            expect(Number(message.blockNumber)).toEqual(block.number)
            expect(message.nPOI).toEqual(rawMessage.nPOI)
        })

        test('write a message - wrong protobuf format', async () => {
            const rawMessage = {
                deployment: "withoutPOI"
            }

            await expect(async () => {await messenger.writeMessage(ethClient, rawMessage, domain, types, block)})
            .rejects
            .toThrowError(`Cannot write and encode the message, check formatting`);
        })

        test('getOperator from registry',async () => {
            const { provider } = ethClient;
            const operatorAddress = ethClient.getAddress().toLowerCase();
            console.log(operatorAddress)
        })

        // // test the observer
        // test('Observer prepare attestations',async () => {
        //     const { provider } = ethClient;
        //     const rawMessage = {
        //         subgraph: "Qmaaa",
        //         nPOI: "poi0"
        //     }

        //     const encodedMessage = await messenger.writeMessage(ethClient, rawMessage, domain, types, block)
        //     const message = observer.readMessage(encodedMessage)

        //     // fails the first time
        //     const attestation = await observer.prepareAttestation(message, domain, types, poiMessageValues, provider, radioFilter, registryClient)
        //     console.log(`hm`,attestation)

        //     // but the second time with a higher nonce... should be okay?
        //     Date.now = jest.fn(() => Date.parse('2022-01-02'))
        //     const attestation2 = await observer.prepareAttestation(message, domain, types, poiMessageValues, provider, radioFilter, registryClient)
        //     console.log(`hm2`,attestation2)


        // }, 120_000)
  })
})
