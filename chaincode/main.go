// Command employment-passport is the chaincode entrypoint. It registers the
// EmploymentContract and starts the chaincode server that the Fabric peer runs.
package main

import (
	"log"

	"github.com/cheatro-gupto/employment-passport/chaincode/contract"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&contract.EmploymentContract{})
	if err != nil {
		log.Panicf("error creating employment-passport chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("error starting employment-passport chaincode: %v", err)
	}
}
