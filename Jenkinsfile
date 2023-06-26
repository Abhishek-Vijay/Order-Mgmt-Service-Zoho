pipeline {
    agent { label 'build'}
    tools {
        gradle 'gradle-7.4.2'
        jdk 'jdk-17'
    }
    stages {
        
        stage('Checkout') {
            steps {
                cleanWs()
                checkout scm
            }
        }
        stage('Node Build') {
            steps {
                sh "node i"
            }
        }
    }
}

