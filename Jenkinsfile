pipeline {
    agent { label 'build'}
    tools {
        nodejs 'node16'
    }
    stages {
        
        stage('Checkout') {
            steps {
                cleanWs()
                checkout scm
            }
        }
        stage('node Build') {
            steps {
                sh "npm i"
            }
        }
    }
}
